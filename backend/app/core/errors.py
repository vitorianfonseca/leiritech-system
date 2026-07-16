"""Structured API errors rendered through the PRD §7 envelope.

Every error the API returns has the shape::

    {"error": {"code": "...", "message": "...", "details": {...}}}

``ApiError`` subclasses FastAPI's ``HTTPException`` so it flows through the
existing exception handler in ``app.main`` while carrying a stable machine
``code`` and an optional ``details`` object. Messages are user-facing pt-PT
(the product locale); ``code`` is the stable English key clients switch on.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status


class ApiError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.details: dict[str, Any] = details or {}


def unauthorized(
    message: str = "Credenciais inválidas.", code: str = "UNAUTHORIZED"
) -> ApiError:
    return ApiError(status.HTTP_401_UNAUTHORIZED, code, message)


def forbidden(
    message: str = "Não tem permissão para esta ação.", code: str = "FORBIDDEN"
) -> ApiError:
    return ApiError(status.HTTP_403_FORBIDDEN, code, message)


def not_found(
    message: str = "Recurso não encontrado.", code: str = "NOT_FOUND"
) -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, code, message)


def conflict(message: str, code: str = "CONFLICT") -> ApiError:
    return ApiError(status.HTTP_409_CONFLICT, code, message)


def bad_request(message: str, code: str = "BAD_REQUEST") -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, code, message)


def too_many_requests(
    message: str = "Demasiadas tentativas. Tente novamente mais tarde.",
    code: str = "RATE_LIMITED",
) -> ApiError:
    return ApiError(status.HTTP_429_TOO_MANY_REQUESTS, code, message)
