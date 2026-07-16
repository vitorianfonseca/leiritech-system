"""FastAPI application entrypoint for Aurea System."""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.core.config import settings

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger("aurea")

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error_envelope(code: str, message: str, details: Any = None) -> dict[str, Any]:
    """Consistent error envelope (PRD §7)."""
    return {"error": {"code": code, "message": message, "details": details or {}}}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code = exc.detail if isinstance(exc.detail, str) else "HTTP_ERROR"
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_envelope(code=f"HTTP_{exc.status_code}", message=str(code)),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_error_envelope(
            code="VALIDATION_ERROR",
            message="Os dados enviados são inválidos.",
            details={"errors": exc.errors()},
        ),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", path=str(request.url), error=str(exc))
    return JSONResponse(
        status_code=500,
        content=_error_envelope(
            code="INTERNAL_ERROR", message="Ocorreu um erro interno."
        ),
    )


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router, prefix=settings.API_V1_PREFIX)
