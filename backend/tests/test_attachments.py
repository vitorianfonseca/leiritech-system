"""Authorization tests for the attachments API (#46) against Postgres (:5433).

Focus: the IDOR guard — an attachment inherits its parent's visibility, so a
caller who cannot see the parent entity may not list, read, or write its
attachments (BR-002). R2 is unconfigured in tests, so the authorization gate is
what these assertions exercise (it runs before any storage check).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.crm import Company

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def track() -> Iterator[list[uuid.UUID]]:
    ids: list[uuid.UUID] = []
    yield ids
    db = SessionLocal()
    try:
        if ids:
            db.execute(delete(Company).where(Company.id.in_(ids)))
            db.commit()
    finally:
        db.close()


def _make_company(owner_id: uuid.UUID, track: list[uuid.UUID]) -> uuid.UUID:
    db = SessionLocal()
    try:
        company = Company(
            name=f"ACME {uuid.uuid4().hex[:8]}",
            status="active",
            owner_id=owner_id,
            created_by=owner_id,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        track.append(company.id)
        return company.id
    finally:
        db.close()


def test_membro_cannot_list_attachments_of_unscoped_company(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    company_id = _make_company(gestor.id, track)

    # Owner (gestor) may list — parent is visible (empty list; no attachments).
    ok = client.get(
        f"{API}/attachments",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(_token(client, gestor.email)),
    )
    assert ok.status_code == 200, ok.text
    assert ok.json() == []

    # Unrelated Membro may NOT — parent is out of scope → 404 (no existence leak).
    denied = client.get(
        f"{API}/attachments",
        params={"entity_type": "company", "entity_id": str(company_id)},
        headers=_auth(_token(client, membro.email)),
    )
    assert denied.status_code == 404, denied.text


def test_download_url_of_unknown_or_missing_attachment_is_404(client, make_user):
    gestor = make_user(role="gestor")
    resp = client.get(
        f"{API}/attachments/{uuid.uuid4()}/download-url",
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 404, resp.text


def test_unknown_entity_type_fails_closed(client, make_user):
    gestor = make_user(role="gestor")
    resp = client.get(
        f"{API}/attachments",
        params={"entity_type": "not_a_real_type", "entity_id": str(uuid.uuid4())},
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 404, resp.text


def test_upload_url_to_unscoped_company_is_forbidden(client, make_user, track):
    gestor = make_user(role="gestor")
    membro = make_user(role="membro")
    company_id = _make_company(gestor.id, track)

    resp = client.post(
        f"{API}/attachments/upload-url",
        json={
            "entity_type": "company",
            "entity_id": str(company_id),
            "filename": "secret.pdf",
            "content_type": "application/pdf",
            "size_bytes": 1024,
        },
        headers=_auth(_token(client, membro.email)),
    )
    # Blocked by the IDOR guard before any storage work → 404 (enumeration-safe).
    assert resp.status_code == 404, resp.text


def test_upload_url_rejects_disallowed_content_type(client, make_user, track):
    """Audit C2: a content-type outside the allowlist is rejected before a
    presigned URL is ever minted for it."""
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)

    resp = client.post(
        f"{API}/attachments/upload-url",
        json={
            "entity_type": "company",
            "entity_id": str(company_id),
            "filename": "payload.exe",
            "content_type": "application/x-msdownload",
            "size_bytes": 1024,
        },
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["error"]["code"] == "ATTACHMENT_TYPE_NOT_ALLOWED"


def test_upload_url_rejects_oversized_declared_size(client, make_user, track):
    """Audit C2: size_bytes above MAX_ATTACHMENT_SIZE_BYTES fails schema
    validation before the handler ever runs."""
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)

    resp = client.post(
        f"{API}/attachments/upload-url",
        json={
            "entity_type": "company",
            "entity_id": str(company_id),
            "filename": "huge.zip",
            "content_type": "application/zip",
            "size_bytes": 100 * 1024 * 1024,  # 100 MiB > 25 MiB cap
        },
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 422, resp.text


# --------------------------------------------------------------------------
# #47 — server-authoritative upload validation.
#
# The presign endpoint never sees the bytes, so filename/content_type/size are
# all attacker-controlled. These assert that the *server* decides, and that a
# client cannot dodge a rule by lying about or simply omitting a field.
# --------------------------------------------------------------------------

from app.services import attachment_policy  # noqa: E402
from app.storage import r2  # noqa: E402


def _upload(client, token, company_id, **overrides):
    body = {
        "entity_type": "company",
        "entity_id": str(company_id),
        "filename": "proposta.pdf",
        "content_type": "application/pdf",
        "size_bytes": 1024,
    }
    body.update(overrides)
    return client.post(f"{API}/attachments/upload-url", json=body, headers=_auth(token))


def _assert_rejected(resp, reason: str | None = None) -> None:
    assert resp.status_code == 422, resp.text
    error = resp.json()["error"]
    assert error["code"] in {
        "ATTACHMENT_TYPE_NOT_ALLOWED",
        "ATTACHMENT_FILENAME_INVALID",
        "ATTACHMENT_TOO_LARGE",
    }, error
    if reason is not None:
        assert error.get("details", {}).get("reason") == reason, error


def test_valid_upload_passes_validation_and_only_then_hits_storage(
    client, make_user, track
):
    """A legitimate request clears every policy gate. R2 has no credentials in
    tests, so 503 (not 422) is proof validation accepted it."""
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)

    resp = _upload(client, _token(client, gestor.email), company_id)
    assert resp.status_code == 503, resp.text
    assert resp.json()["error"]["code"] == "STORAGE_NOT_CONFIGURED"


def test_omitting_content_type_does_not_bypass_the_allowlist(
    client, make_user, track
):
    """Regression for the #47 defect: the check used to be skipped entirely when
    content_type was absent, so a null type was a free pass for any file."""
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)
    token = _token(client, gestor.email)

    _assert_rejected(
        _upload(client, token, company_id, filename="payload.exe", content_type=None),
        reason="dangerous_extension",
    )
    # ...and an unknown-but-not-dangerous extension is rejected too (allowlist).
    _assert_rejected(
        _upload(client, token, company_id, filename="thing.xyz", content_type=None),
        reason="extension_not_allowed",
    )


def test_omitting_size_bytes_does_not_bypass_the_size_cap(client, make_user, track):
    """Regression for the #47 defect: size_bytes was optional, so omitting it
    skipped the cap. It is now required."""
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)

    resp = client.post(
        f"{API}/attachments/upload-url",
        json={
            "entity_type": "company",
            "entity_id": str(company_id),
            "filename": "proposta.pdf",
            "content_type": "application/pdf",
        },
        headers=_auth(_token(client, gestor.email)),
    )
    assert resp.status_code == 422, resp.text


def test_content_type_cannot_launder_a_dangerous_extension(client, make_user, track):
    """Declaring an allowed MIME for an executable must not get it signed."""
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)

    _assert_rejected(
        _upload(
            client,
            _token(client, gestor.email),
            company_id,
            filename="malware.exe",
            content_type="application/pdf",
        ),
        reason="dangerous_extension",
    )


def test_double_extension_is_rejected_in_both_orders(client, make_user, track):
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)
    token = _token(client, gestor.email)

    for name in ("invoice.pdf.exe", "invoice.exe.pdf", "report.pdf.sh"):
        _assert_rejected(
            _upload(client, token, company_id, filename=name, content_type=None),
            reason="dangerous_extension",
        )


def test_declared_content_type_must_match_the_extension(client, make_user, track):
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)

    _assert_rejected(
        _upload(
            client,
            _token(client, gestor.email),
            company_id,
            filename="photo.png",
            content_type="application/pdf",
        ),
        reason="content_type_mismatch",
    )


def test_zero_byte_and_oversized_uploads_are_rejected(client, make_user, track):
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)
    token = _token(client, gestor.email)

    # Both are caught by the schema bounds before the handler runs.
    assert _upload(client, token, company_id, size_bytes=0).status_code == 422
    assert (
        _upload(
            client,
            token,
            company_id,
            size_bytes=attachment_policy.MAX_ATTACHMENT_SIZE_BYTES + 1,
        ).status_code
        == 422
    )


def test_filename_with_path_or_control_characters_is_handled(client, make_user, track):
    gestor = make_user(role="gestor")
    company_id = _make_company(gestor.id, track)
    token = _token(client, gestor.email)

    # Control characters are rejected outright.
    _assert_rejected(
        _upload(client, token, company_id, filename="bad\r\nname.pdf")
    )
    # Traversal is stripped to a basename, not rejected — and the stripped name
    # is what gets validated (".pdf" here), so this stays a legitimate upload.
    resp = _upload(client, token, company_id, filename="../../../etc/passwd.pdf")
    assert resp.status_code == 503, resp.text


# --- pure policy unit tests (no DB, no HTTP) ------------------------------


def test_policy_derives_content_type_from_the_extension():
    """The extension is authoritative: a missing or useless declared type is
    replaced by the canonical one, which is what gets signed."""
    for declared in (None, "", "application/octet-stream"):
        policy = attachment_policy.validate_upload("relatorio.pdf", declared, 10)
        assert policy.content_type == "application/pdf"
        assert policy.filename == "relatorio.pdf"
        assert policy.size_bytes == 10


def test_policy_normalises_content_type_parameters_and_filename():
    policy = attachment_policy.validate_upload(
        "C:\\Users\\x\\dados.csv", "text/csv; charset=utf-8", 5
    )
    assert policy.filename == "dados.csv"
    assert policy.content_type == "text/csv"


def test_policy_rejects_windows_trailing_dot_trick():
    """'evil.exe. ' is saved by Windows as 'evil.exe'; a naive extension check
    would see the trailing space as the extension."""
    with pytest.raises(Exception) as exc:
        attachment_policy.validate_upload("evil.exe. ", None, 10)
    assert exc.value.status_code == 422


def test_policy_rejects_bare_dotfile_without_extension():
    with pytest.raises(Exception) as exc:
        attachment_policy.validate_upload(".env", None, 10)
    assert exc.value.status_code == 422


def test_html_and_svg_are_treated_as_dangerous():
    """Both execute script in the bucket's origin if ever served inline."""
    for name in ("page.html", "logo.svg", "doc.xhtml"):
        with pytest.raises(Exception) as exc:
            attachment_policy.validate_upload(name, None, 10)
        assert exc.value.status_code == 422


def test_safe_download_content_type_degrades_unknown_types():
    assert (
        attachment_policy.safe_download_content_type("image/svg+xml")
        == "application/octet-stream"
    )
    assert attachment_policy.safe_download_content_type(None) == "application/octet-stream"
    assert attachment_policy.safe_download_content_type("application/pdf") == "application/pdf"


# --- storage layer: the constraints must reach the signature --------------


class _FakeS3Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def generate_presigned_url(self, op, Params, ExpiresIn):  # noqa: N803
        self.calls.append((op, Params))
        return "https://storage.example/signed"


def test_presign_upload_binds_content_type_and_length_to_the_signature(monkeypatch):
    """The whole policy is advisory unless these two land in the signed request:
    otherwise the client can PUT anything at the URL it was handed."""
    fake = _FakeS3Client()
    monkeypatch.setattr(r2, "_client", lambda: fake)
    monkeypatch.setattr(r2.settings, "R2_BUCKET", "bucket")

    r2.presign_upload("k", content_type="application/pdf", content_length=1234)

    op, params = fake.calls[0]
    assert op == "put_object"
    assert params["ContentType"] == "application/pdf"
    assert params["ContentLength"] == 1234


def test_presign_download_forces_attachment_disposition(monkeypatch):
    fake = _FakeS3Client()
    monkeypatch.setattr(r2, "_client", lambda: fake)
    monkeypatch.setattr(r2.settings, "R2_BUCKET", "bucket")

    r2.presign_download("k", filename='we"ird\r\n.pdf', content_type="application/pdf")

    _, params = fake.calls[0]
    assert params["ResponseContentDisposition"].startswith("attachment;")
    # Quotes/CRLF stripped so the header cannot be broken out of.
    assert '"' not in params["ResponseContentDisposition"].split("filename=", 1)[1][1:-1]
    assert "\r" not in params["ResponseContentDisposition"]
    assert params["ResponseContentType"] == "application/pdf"
