"""Transactional email via Resend.

In development (``ENVIRONMENT`` not production-like) or whenever
``RESEND_API_KEY`` is unset, the outgoing message and any action link are
logged instead of sent so flows can be exercised end-to-end without a mail
provider — mirroring the production-gating convention in
``app.core.config.Settings`` (``ENVIRONMENT`` in ``{"production", "prod",
"staging"}``). Outside that dev path, the message is POSTed to the Resend API
(https://api.resend.com/emails). A failed send is logged and swallowed —
email delivery is best-effort and must never fail the request that triggered
it (e.g. inviting a member, requesting a password reset).
"""

from __future__ import annotations

import html as html_lib

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger("aurea.email")

_PRODUCTION_LIKE_ENVIRONMENTS = {"production", "prod", "staging"}
_RESEND_API_URL = "https://api.resend.com/emails"
_SEND_TIMEOUT = 10.0


class EmailService:
    def _send(self, *, to: str, subject: str, body: str, link: str | None = None) -> None:
        env = settings.ENVIRONMENT.lower()
        is_dev = env == "development"
        should_send = bool(settings.RESEND_API_KEY) and env in _PRODUCTION_LIKE_ENVIRONMENTS

        if not should_send:
            # Action links carry single-use invite/reset tokens. Logging the
            # full link exposes those tokens to anyone with log access (log =
            # credential store), so the raw link is emitted ONLY in a local
            # development environment. Elsewhere logs record just recipient +
            # subject.
            logger.info(
                "email_send_dev_stub",
                to=to,
                subject=subject,
                body=body if is_dev else None,
                link=link if is_dev else None,
            )
            return

        html_body = self._render_html(body, link)
        try:
            response = httpx.post(
                _RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.EMAIL_FROM,
                    "to": [to],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=_SEND_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            # Resend responded, but with an error status — log the provider's
            # error body (no token/link is in it) and move on.
            logger.error(
                "email_send_failed",
                to=to,
                subject=subject,
                status_code=exc.response.status_code,
                error=exc.response.text,
            )
        except httpx.HTTPError as exc:
            # Network-level failure (timeout, DNS, connection refused, ...).
            logger.error("email_send_failed", to=to, subject=subject, error=str(exc))
        else:
            logger.info("email_sent", to=to, subject=subject, provider="resend")

    @staticmethod
    def _render_html(body: str, link: str | None) -> str:
        escaped_body = html_lib.escape(body)
        if not link:
            return f"<p>{escaped_body}</p>"
        escaped_link = html_lib.escape(link, quote=True)
        return f'<p>{escaped_body}</p><p><a href="{escaped_link}">{escaped_link}</a></p>'

    def send_invitation(self, *, to: str, accept_link: str, role: str) -> None:
        self._send(
            to=to,
            subject="Convite para o Aurea System",
            body=f"Foi convidado como {role}. Utilize o link para criar a sua conta.",
            link=accept_link,
        )

    def send_password_reset(self, *, to: str, reset_link: str) -> None:
        self._send(
            to=to,
            subject="Redefinição de palavra-passe — Aurea System",
            body="Recebemos um pedido para redefinir a sua palavra-passe.",
            link=reset_link,
        )


email_service = EmailService()
