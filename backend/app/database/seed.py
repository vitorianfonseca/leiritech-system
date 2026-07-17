"""Idempotent database seed (Issue #11, F0/§36).

Creates:

1. A first **Administrador** account (BR-007 — seed/CLI only, no public signup).
   Credentials come from ``--email`` / ``--password`` / ``--name`` CLI args or the
   ``SEED_ADMIN_EMAIL`` / ``SEED_ADMIN_PASSWORD`` / ``SEED_ADMIN_NAME`` environment
   variables. The password is Argon2-hashed via :mod:`app.core.security`; it is
   never persisted in plaintext and never hardcoded.

2. Realistic Aurea (creative studio) demo data: team members, pipeline stages,
   companies, contacts, opportunities, proposals, projects (with health states),
   phases, tasks, payment milestones and a few interactions.

Every insert is **check-before-insert** keyed on a natural identifier, so the
script is safe to run repeatedly — re-running it will not create duplicates.

Usage::

    uv run python -m app.database.seed
    uv run python -m app.database.seed --email founder@aurea.studio --password "s3cret-pass"
    SEED_ADMIN_PASSWORD="s3cret-pass" uv run python -m app.database.seed

Money is stored as **integer EUR cents**. Enum/state fields store stable
English keys (see :mod:`app.models.enums`).
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.database.session import SessionLocal
from app.models.crm import (
    Company,
    Contact,
    Interaction,
    Opportunity,
    PipelineStage,
    Proposal,
)
from app.models.finance import PaymentMilestone
from app.models.project import Project, ProjectMember, ProjectPhase
from app.models.task import Task
from app.models.user import User, UserPreference

# Default admin identity (override via CLI args or env). The password has NO
# default and NO hardcoded fallback — outside development it must be supplied,
# and in development an absent password is randomly generated and shown once, so
# a known/weak credential is never baked into the repo or silently seeded.
_DEFAULT_ADMIN_EMAIL = "admin@aurea.studio"
_DEFAULT_ADMIN_NAME = "Aurea Admin"


def _is_development() -> bool:
    """True only when ENVIRONMENT is *explicitly* 'development'.

    Fail-closed: an unset/blank/unknown ENVIRONMENT is treated as NON-dev, so a
    misconfigured production never falls into the convenience paths (auto-generated
    password, demo accounts). Demo accounts and password auto-generation are
    dev-only affordances, never a production default.
    """
    return os.getenv("ENVIRONMENT", "").strip().lower() == "development"


def _euros(amount: float) -> int:
    """Convert a EUR amount to integer cents."""
    return round(amount * 100)


def _get_or_create(
    db: Session, model, defaults: dict | None = None, **filters
):
    """Return the existing row matching ``filters`` or create it.

    Returns a ``(instance, created)`` tuple. Newly created rows are flushed so
    their primary keys are available to dependent inserts within the same run.
    """
    stmt = select(model).filter_by(**filters)
    instance = db.execute(stmt).scalar_one_or_none()
    if instance is not None:
        return instance, False
    params = {**filters, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()
    return instance, True


# --------------------------------------------------------------------------- #
# Admin bootstrap
# --------------------------------------------------------------------------- #
def seed_admin(db: Session, *, name: str, email: str, password: str) -> User:
    email = email.lower()
    admin = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if admin is not None:
        return admin
    admin = User(
        name=name,
        email=email,
        password_hash=security.hash_password(password),
        role="admin",
        status="active",
        weekly_capacity_hours=40,
    )
    db.add(admin)
    db.flush()
    _get_or_create(db, UserPreference, user_id=admin.id)
    return admin


# --------------------------------------------------------------------------- #
# Team members (~5, in addition to the admin)
# --------------------------------------------------------------------------- #
_MEMBERS = [
    ("Beatriz Lopes", "beatriz@aurea.studio", "gestor", 40, 3500, True, True),
    ("Diogo Ferreira", "diogo@aurea.studio", "membro", 40, 2800, False, False),
    ("Carla Nunes", "carla@aurea.studio", "membro", 32, 2600, False, False),
    ("Rui Marques", "rui@aurea.studio", "membro", 40, 3000, False, False),
    ("Sofia Antunes", "sofia@aurea.studio", "membro", 24, 2500, False, False),
]


def seed_members(db: Session, *, default_password: str) -> dict[str, User]:
    pw_hash = security.hash_password(default_password)
    users: dict[str, User] = {}
    for name, email, role, capacity, cost_eur, pay_grant, inv_grant in _MEMBERS:
        user, _ = _get_or_create(
            db,
            User,
            email=email.lower(),
            defaults={
                "name": name,
                "password_hash": pw_hash,
                "role": role,
                "status": "active",
                "weekly_capacity_hours": capacity,
                "internal_cost_rate": _euros(cost_eur) // 160,  # ~cents/hour
                "payments_grant": pay_grant,
                "invites_grant": inv_grant,
            },
        )
        _get_or_create(db, UserPreference, user_id=user.id)
        users[email.lower()] = user
    return users


# --------------------------------------------------------------------------- #
# Pipeline stages
# --------------------------------------------------------------------------- #
_STAGES = [
    ("Lead", "lead", "#94a3b8", 0, 10),
    ("Qualificado", "qualified", "#60a5fa", 1, 25),
    ("Proposta", "proposal", "#a78bfa", 2, 50),
    ("Negociação", "negotiation", "#fbbf24", 3, 75),
    ("Fechado", "closing", "#34d399", 4, 90),
]


def seed_stages(db: Session, admin_id) -> dict[str, PipelineStage]:
    stages: dict[str, PipelineStage] = {}
    for name, code, color, order_index, win in _STAGES:
        stage, _ = _get_or_create(
            db,
            PipelineStage,
            code=code,
            defaults={
                "name": name,
                "color": color,
                "order_index": order_index,
                "win_probability": win,
                "created_by": admin_id,
            },
        )
        stages[code] = stage
    return stages


# --------------------------------------------------------------------------- #
# Companies + contacts
# --------------------------------------------------------------------------- #
_COMPANIES = [
    ("Miolo Editora", "Publishing", "active", "referral"),
    ("Verde Café", "Hospitality", "active", "inbound"),
    ("Nortada Surf", "Retail", "potential", "event"),
    ("Clínica Serena", "Healthcare", "active", "referral"),
    ("Fábrica de Ideias", "Consulting", "partner", "network"),
    ("Doce Lima", "Food & Beverage", "potential", "inbound"),
    ("Atlântico Imobiliária", "Real Estate", "inactive", "cold"),
    ("Lumen Arquitetos", "Architecture", "active", "referral"),
]

_CONTACTS = [
    ("Miolo Editora", "Helena Vaz", "Diretora Editorial", "helena@miolo.pt"),
    ("Verde Café", "Tiago Brito", "Fundador", "tiago@verdecafe.pt"),
    ("Nortada Surf", "Marta Sousa", "Marketing", "marta@nortada.pt"),
    ("Clínica Serena", "Dr. Paulo Reis", "Diretor Clínico", "paulo@serena.pt"),
    ("Fábrica de Ideias", "Inês Cardoso", "Partner", "ines@fabricaideias.pt"),
    ("Doce Lima", "André Lima", "Proprietário", "andre@docelima.pt"),
    ("Atlântico Imobiliária", "Cláudia Melo", "CEO", "claudia@atlantico.pt"),
    ("Lumen Arquitetos", "Nuno Faria", "Sócio", "nuno@lumen.pt"),
]


def seed_companies(
    db: Session, owners: list[User], admin_id
) -> tuple[dict[str, Company], dict[str, Contact]]:
    companies: dict[str, Company] = {}
    for i, (name, sector, status, source) in enumerate(_COMPANIES):
        owner = owners[i % len(owners)]
        company, _ = _get_or_create(
            db,
            Company,
            name=name,
            defaults={
                "sector": sector,
                "status": status,
                "source": source,
                "owner_id": owner.id,
                "is_active_client": status in ("active", "partner"),
                "created_by": admin_id,
            },
        )
        companies[name] = company

    contacts: dict[str, Contact] = {}
    for i, (company_name, name, role_title, email) in enumerate(_CONTACTS):
        company = companies[company_name]
        owner = owners[i % len(owners)]
        contact, _ = _get_or_create(
            db,
            Contact,
            email=email.lower(),
            defaults={
                "company_id": company.id,
                "name": name,
                "role_title": role_title,
                "owner_id": owner.id,
                "status": "active",
                "created_by": admin_id,
            },
        )
        contacts[company_name] = contact
    return companies, contacts


# --------------------------------------------------------------------------- #
# Opportunities (~10)
# --------------------------------------------------------------------------- #
# (title, company, stage_code, value_eur, probability, outcome, days_to_close)
_OPPORTUNITIES = [
    ("Rebranding Miolo 2026", "Miolo Editora", "closing", 18000, 90, "won", 5),
    ("Website Verde Café", "Verde Café", "proposal", 9500, 50, "open", 20),
    ("Campanha Nortada Verão", "Nortada Surf", "qualified", 12000, 30, "open", 35),
    ("Identidade Clínica Serena", "Clínica Serena", "negotiation", 14000, 75, "open", 12),
    ("Consultoria Fábrica", "Fábrica de Ideias", "closing", 22000, 90, "won", 3),
    ("Packaging Doce Lima", "Doce Lima", "lead", 6000, 10, "open", 45),
    ("Portal Atlântico", "Atlântico Imobiliária", "qualified", 16000, 25, "lost", 60),
    ("Brochura Lumen", "Lumen Arquitetos", "proposal", 7500, 50, "open", 18),
    ("App Verde Café Fidelização", "Verde Café", "lead", 20000, 15, "open", 70),
    ("Sinalética Clínica Serena", "Clínica Serena", "negotiation", 5400, 70, "open", 15),
]


def seed_opportunities(
    db: Session,
    companies: dict[str, Company],
    contacts: dict[str, Contact],
    stages: dict[str, PipelineStage],
    owners: list[User],
    admin_id,
) -> dict[str, Opportunity]:
    today = date.today()
    opportunities: dict[str, Opportunity] = {}
    for i, (title, company_name, stage_code, value_eur, prob, outcome, days) in enumerate(
        _OPPORTUNITIES
    ):
        company = companies[company_name]
        contact = contacts.get(company_name)
        owner = owners[i % len(owners)]
        defaults = {
            "company_id": company.id,
            "primary_contact_id": contact.id if contact else None,
            "owner_id": owner.id,
            "stage_id": stages[stage_code].id,
            "estimated_value": _euros(value_eur),
            "probability": prob,
            "expected_close_date": today + timedelta(days=days),
            "outcome": outcome,
            "source": company.source,
            "created_by": admin_id,
        }
        if outcome == "lost":
            defaults["lost_reason"] = "Orçamento acima do budget do cliente."
            defaults["lost_at"] = datetime.now(UTC)
        opp, _ = _get_or_create(db, Opportunity, title=title, defaults=defaults)
        opportunities[title] = opp
    return opportunities


def seed_proposals(
    db: Session,
    opportunities: dict[str, Opportunity],
    companies: dict[str, Company],
    contacts: dict[str, Contact],
    admin_id,
) -> dict[str, Proposal]:
    today = date.today()
    specs = [
        ("PROP-2026-001", "Rebranding Miolo 2026", "Miolo Editora", 18000, "accepted"),
        ("PROP-2026-002", "Website Verde Café", "Verde Café", 9500, "sent"),
        ("PROP-2026-003", "Consultoria Fábrica", "Fábrica de Ideias", 22000, "accepted"),
        ("PROP-2026-004", "Brochura Lumen", "Lumen Arquitetos", 7500, "viewed"),
    ]
    proposals: dict[str, Proposal] = {}
    for reference, opp_title, company_name, value_eur, status in specs:
        opp = opportunities[opp_title]
        proposal, _ = _get_or_create(
            db,
            Proposal,
            reference=reference,
            defaults={
                "opportunity_id": opp.id,
                "company_id": companies[company_name].id,
                "contact_id": contacts[company_name].id,
                "value": _euros(value_eur),
                "created_date": today - timedelta(days=10),
                "sent_date": today - timedelta(days=7),
                "valid_until": today + timedelta(days=23),
                "status": status,
                "created_by": admin_id,
            },
        )
        proposals[reference] = proposal
    return proposals


# --------------------------------------------------------------------------- #
# Projects (with health states), phases, members, tasks, payment milestones
# --------------------------------------------------------------------------- #
# (name, company, opp_title, status, published_health, contracted_eur, hours_budget)
_PROJECTS = [
    ("Rebranding Miolo", "Miolo Editora", "Rebranding Miolo 2026",
     "active", "healthy", 18000, 220),
    ("Consultoria Fábrica de Ideias", "Fábrica de Ideias", "Consultoria Fábrica",
     "active", "attention", 22000, 180),
    ("Identidade Clínica Serena", "Clínica Serena", None,
     "planning", "healthy", 14000, 160),
    ("Portal Atlântico (arquivado)", "Atlântico Imobiliária", None,
     "on_hold", "at_risk", 16000, 200),
]

_PHASES = ["Descoberta", "Conceito", "Produção", "Entrega"]


def seed_projects(
    db: Session,
    companies: dict[str, Company],
    opportunities: dict[str, Opportunity],
    members: list[User],
    manager: User,
    admin_id,
) -> list[Project]:
    today = date.today()
    projects: list[Project] = []
    for idx, (
        name,
        company_name,
        opp_title,
        status,
        health,
        contracted_eur,
        hours_budget,
    ) in enumerate(_PROJECTS):
        opp = opportunities.get(opp_title) if opp_title else None
        project, created = _get_or_create(
            db,
            Project,
            name=name,
            defaults={
                "company_id": companies[company_name].id,
                "opportunity_id": opp.id if opp else None,
                "manager_id": manager.id,
                "status": status,
                "suggested_health": health,
                "published_health": health,
                "start_date": today - timedelta(days=30),
                "deadline": today + timedelta(days=60),
                "contracted_value": _euros(contracted_eur),
                "hours_budget": hours_budget,
                "internal_cost_rate": _euros(35),  # cents/hour blended
                "created_by": admin_id,
            },
        )
        projects.append(project)
        if not created:
            continue

        # Members: manager + two rotating members
        assigned = [manager, members[idx % len(members)], members[(idx + 1) % len(members)]]
        for user in assigned:
            _get_or_create(
                db,
                ProjectMember,
                project_id=project.id,
                user_id=user.id,
                defaults={
                    "role_in_project": "manager" if user.id == manager.id else "contributor",
                    "created_by": admin_id,
                },
            )

        # Phases
        phase_objs: list[ProjectPhase] = []
        phase_status = ["completed", "in_progress", "not_started", "not_started"]
        for p_i, phase_name in enumerate(_PHASES):
            phase, _ = _get_or_create(
                db,
                ProjectPhase,
                project_id=project.id,
                name=phase_name,
                defaults={
                    "order_index": p_i,
                    "status": phase_status[p_i],
                    "progress": 100 if phase_status[p_i] == "completed" else (
                        40 if phase_status[p_i] == "in_progress" else 0
                    ),
                    "owner_id": manager.id,
                    "start_date": today - timedelta(days=30 - p_i * 7),
                    "deadline": today + timedelta(days=p_i * 14),
                    "created_by": admin_id,
                },
            )
            phase_objs.append(phase)

        # Tasks
        task_specs = [
            ("Briefing com cliente", "done", "high", phase_objs[0], assigned[1]),
            ("Pesquisa de referências", "done", "normal", phase_objs[0], assigned[2]),
            ("Propostas de conceito", "in_progress", "high", phase_objs[1], assigned[1]),
            ("Revisão interna", "in_review", "normal", phase_objs[1], manager),
            ("Produção de artes finais", "todo", "normal", phase_objs[2], assigned[2]),
            ("Manual de marca", "todo", "low", phase_objs[3], assigned[1]),
        ]
        for t_i, (title, t_status, priority, phase, assignee) in enumerate(task_specs):
            _get_or_create(
                db,
                Task,
                project_id=project.id,
                title=title,
                defaults={
                    "phase_id": phase.id,
                    "status": t_status,
                    "priority": priority,
                    "primary_assignee_id": assignee.id,
                    "estimate_hours": 8 + t_i * 2,
                    "start_date": today - timedelta(days=10),
                    "due_date": today + timedelta(days=7 + t_i * 3),
                    "created_by": admin_id,
                },
            )

        # Payment milestones (integer EUR cents)
        half = _euros(contracted_eur) // 2
        pm_specs = [
            ("Adiantamento (50%)", half, "paid", -20, -18, -16),
            ("Entrega final (50%)", _euros(contracted_eur) - half, "planned", 60, None, None),
        ]
        for desc, amount, pm_status, exp_off, inv_off, paid_off in pm_specs:
            _get_or_create(
                db,
                PaymentMilestone,
                project_id=project.id,
                description=desc,
                defaults={
                    "company_id": companies[company_name].id,
                    "amount": amount,
                    "received_amount": amount if pm_status == "paid" else 0,
                    "status": pm_status,
                    "expected_date": today + timedelta(days=exp_off),
                    "invoiced_date": today + timedelta(days=inv_off) if inv_off else None,
                    "paid_date": today + timedelta(days=paid_off) if paid_off else None,
                    "reference": f"REF-{project.name[:4].upper()}-{pm_status[:3].upper()}",
                    "confirmer_id": manager.id if pm_status == "paid" else None,
                    "created_by": admin_id,
                },
            )
    return projects


def seed_interactions(
    db: Session,
    companies: dict[str, Company],
    contacts: dict[str, Contact],
    opportunities: dict[str, Opportunity],
    owners: list[User],
    admin_id,
) -> None:
    specs = [
        ("call", "Miolo Editora", "Rebranding Miolo 2026",
         "Chamada de kickoff. Cliente entusiasmado com a direção criativa."),
        ("meeting", "Verde Café", "Website Verde Café",
         "Reunião de apresentação da proposta de website."),
        ("email", "Clínica Serena", "Identidade Clínica Serena",
         "Envio de moodboard inicial para validação."),
        ("note", "Lumen Arquitetos", "Brochura Lumen",
         "Nota: cliente prefere paleta sóbria, evitar cores vivas."),
        ("followup", "Nortada Surf", "Campanha Nortada Verão",
         "Follow-up agendado para rever timings da campanha de verão."),
    ]
    now = datetime.now(UTC)
    for i, (itype, company_name, opp_title, body) in enumerate(specs):
        company = companies[company_name]
        opp = opportunities.get(opp_title)
        # Idempotency: keyed on (company, body) which is unique in the demo set.
        _get_or_create(
            db,
            Interaction,
            company_id=company.id,
            body=body,
            defaults={
                "type": itype,
                "contact_id": contacts[company_name].id,
                "opportunity_id": opp.id if opp else None,
                "occurred_at": now - timedelta(days=i * 2),
                "user_id": owners[i % len(owners)].id,
                "created_by": admin_id,
            },
        )


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def run_seed(
    db: Session,
    *,
    admin_name: str,
    admin_email: str,
    admin_password: str,
    include_demo: bool,
    demo_password: str | None = None,
) -> dict:
    # The first admin is the only production-relevant record. Demo accounts (which
    # carry a shared, printed demo password) are seeded ONLY when include_demo is
    # set — never in production — so no known-credential accounts can leak there.
    admin = seed_admin(db, name=admin_name, email=admin_email, password=admin_password)
    summary: dict = {"admin": admin.email, "demo": include_demo}
    if not include_demo:
        return summary

    if not demo_password:
        raise ValueError("demo_password is required when include_demo is set")
    # Demo members get their OWN password, distinct from the admin's — never reuse
    # the admin credential across accounts (one of them is a Gestor with grants).
    members_map = seed_members(db, default_password=demo_password)
    members = list(members_map.values())
    manager = members_map["beatriz@aurea.studio"]  # the Gestor
    owners = [admin, *members]

    stages = seed_stages(db, admin.id)
    companies, contacts = seed_companies(db, owners, admin.id)
    opportunities = seed_opportunities(db, companies, contacts, stages, owners, admin.id)
    proposals = seed_proposals(db, opportunities, companies, contacts, admin.id)
    projects = seed_projects(db, companies, opportunities, members, manager, admin.id)
    seed_interactions(db, companies, contacts, opportunities, owners, admin.id)

    summary.update(
        {
            "members": len(members),
            "pipeline_stages": len(stages),
            "companies": len(companies),
            "contacts": len(contacts),
            "opportunities": len(opportunities),
            "proposals": len(proposals),
            "projects": len(projects),
        }
    )
    return summary


def _resolve_admin_credentials(
    args: argparse.Namespace,
) -> tuple[str, str, str, bool]:
    """Return (name, email, password, generated).

    Password precedence: --password → SEED_ADMIN_PASSWORD → (development only)
    a freshly generated random secret. Outside development an absent password is
    a hard error (fail-closed) — never a default. ``generated`` flags the random
    case so main() can print it once for the operator.
    """
    name = args.name or os.getenv("SEED_ADMIN_NAME") or _DEFAULT_ADMIN_NAME
    email = args.email or os.getenv("SEED_ADMIN_EMAIL") or _DEFAULT_ADMIN_EMAIL
    password = args.password or os.getenv("SEED_ADMIN_PASSWORD")
    generated = False
    if not password:
        if _is_development():
            password = secrets.token_urlsafe(16)
            generated = True
        else:
            print(
                "error: admin password required outside development — pass "
                "--password or set SEED_ADMIN_PASSWORD (no default, no fallback).",
                file=sys.stderr,
            )
            raise SystemExit(2)
    if len(password) < 10:
        print("error: admin password must be at least 10 characters", file=sys.stderr)
        raise SystemExit(2)
    return name, email, password, generated


def _resolve_demo(args: argparse.Namespace) -> tuple[bool, str | None, bool]:
    """Return (include_demo, demo_password, demo_generated).

    Demo data is seeded only in development or with an explicit --demo flag. Its
    password comes from SEED_DEMO_PASSWORD or is generated (distinct from the
    admin's) — demo accounts never share the admin credential.
    """
    include_demo = _is_development() or args.demo
    if not include_demo:
        return False, None, False
    demo_password = os.getenv("SEED_DEMO_PASSWORD")
    if demo_password:
        return True, demo_password, False
    return True, secrets.token_urlsafe(16), True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="app.database.seed",
        description="Idempotent seed: first admin + Aurea demo data (Issue #11).",
    )
    parser.add_argument("--name", default=None, help="admin display name")
    parser.add_argument("--email", default=None, help="admin email")
    parser.add_argument(
        "--password",
        default=None,
        help="admin password (>=10 chars); falls back to SEED_ADMIN_PASSWORD env",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="also seed Aurea demo data (default in development; opt-in elsewhere)",
    )
    args = parser.parse_args(argv)
    name, email, password, generated = _resolve_admin_credentials(args)
    include_demo, demo_password, demo_generated = _resolve_demo(args)

    db = SessionLocal()
    try:
        summary = run_seed(
            db,
            admin_name=name,
            admin_email=email,
            admin_password=password,
            include_demo=include_demo,
            demo_password=demo_password,
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001 — surface any failure to the operator
        db.rollback()
        print(f"error: seed failed — {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print("seed complete (idempotent):")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    # Secrets are shown ONCE here (never logged/persisted) so the operator can
    # sign in. A newly created admin keeps this password; on a re-run the existing
    # admin is unchanged (idempotent) and this generated value simply won't apply.
    if generated:
        print(f"  generated admin password (shown once): {password}")
    if demo_generated:
        print(f"  generated demo-member password (shown once): {demo_password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
