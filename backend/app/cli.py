"""Administrative CLI.

Usage::

    python -m app.cli create-admin --name "Ana" --email ana@studio.pt

The first Administrador can ONLY be created this way (BR-007 — no public signup).
The password may be passed with ``--password`` or, preferably, entered
interactively so it never lands in shell history.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from app.core.errors import ApiError
from app.database.session import SessionLocal
from app.services import user_service


def _create_admin(args: argparse.Namespace) -> int:
    password = args.password or getpass.getpass("Password (min 10 chars): ")
    if len(password) < 10:
        print("error: password must be at least 10 characters", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        user = user_service.create_admin(
            db, name=args.name, email=args.email, password=password
        )
        db.commit()
    except ApiError as exc:
        db.rollback()
        print(f"error: {exc.message}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(f"created admin {user.email} (id={user.id})")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    admin = sub.add_parser("create-admin", help="Bootstrap the first Administrador")
    admin.add_argument("--name", required=True)
    admin.add_argument("--email", required=True)
    admin.add_argument("--password", default=None, help="omit to enter interactively")
    admin.set_defaults(func=_create_admin)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
