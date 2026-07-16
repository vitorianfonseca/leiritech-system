"""Transactional email — stubbed for now.

In development (no ``RESEND_API_KEY``) the outgoing message and any action link
are logged so flows can be exercised end-to-end without a mail provider. Wiring
the real Resend HTTP call is a later issue (flagged in the handoff).
"""

from __future__ import annotations

import structlog

from app.core.config import settings

logger = structlog.get_logger("aurea.email")


class EmailService:
    def _send(self, *, to: str, subject: str, body: str, link: str | None = None) -> None:
        if settings.RESEND_API_KEY:
            # TODO(issue: email-delivery): POST to Resend API. Until then, even in
            # a configured environment we only log to avoid a hard dependency.
            logger.info("email_send_pending_provider", to=to, subject=subject, link=link)
            return
        logger.info(
            "email_send_dev_stub",
            to=to,
            subject=subject,
            body=body,
            link=link,
        )

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
