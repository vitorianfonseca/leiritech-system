"""Rich ~12-month demo dataset generator (dev only).

Wipes and regenerates every *business* entity (CRM, projects, tasks, time,
finance, collaboration) so that every page, dashboard and report renders full
and believable — roughly one year of studio activity up to today, plus a few
near-future deadlines.

What it KEEPS (never deleted):

* ``users`` — the login accounts. The Admin **intglogin@aurea.pt** is ensured
  (created with the requested dev password if missing, password left untouched
  if already present) and the existing ``@aurea.studio`` members are kept; a few
  extra members are added for a fuller team.
* ``pipeline_stages`` — the canonical 6 buyer-progress stages (seeded by
  :mod:`app.database.seed`; created here only if absent).

What it WIPES then regenerates (children → parents, FK-safe):

    activity_logs, mentions, comments, notifications, time_entries,
    task_assignees, task_checklist_items, task_dependencies, tasks,
    milestones, project_phases, project_members, payment_milestones,
    project_costs, interactions, meetings, proposals, projects,
    opportunities, contacts, companies

Determinism: :func:`random.seed` is fixed (42), so re-running yields the same
*coherent* dataset (same counts/relationships), never duplicates. Primary keys
are UUIDs and therefore differ between runs, which is fine.

Money is stored as **integer EUR cents**. Enum/state fields store the stable
English keys from :mod:`app.models.enums`. All datetimes are timezone-aware UTC.

Usage::

    ENVIRONMENT=development uv run python -m app.database.seed_rich
    ENVIRONMENT=development uv run python -m app.database.seed --rich
"""

from __future__ import annotations

import os
import random
import sys
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.database.seed import seed_admin, seed_stages
from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog, Comment, Mention, Notification
from app.models.crm import (
    Company,
    Contact,
    Interaction,
    Meeting,
    Opportunity,
    PipelineStage,
    Proposal,
)
from app.models.finance import PaymentMilestone, ProjectCost
from app.models.project import Project, ProjectMember, ProjectPhase
from app.models.task import Task, TaskAssignee
from app.models.time_entry import TimeEntry
from app.models.user import User, UserPreference

SEED = 42

# Role-dependent utilization targets — MUST mirror ``workload_service`` so the
# generated open-task load maps to the same allocation_pct the app displays.
_ROLE_TARGET = {
    "membro": settings.WORKLOAD_TARGET_MEMBRO,
    "gestor": settings.WORKLOAD_TARGET_GESTOR,
    "admin": settings.WORKLOAD_TARGET_ADMIN,
}


def _role_target(role: str) -> float:
    return _ROLE_TARGET.get(role, settings.WORKLOAD_TARGET_MEMBRO)


LOGIN_ADMIN_EMAIL = "intglogin@aurea.pt"
LOGIN_ADMIN_NAME = "Aurea Interno"
LOGIN_ADMIN_PASSWORD = "aurea-dev-2026"

NOW = datetime.now(UTC)
TODAY = NOW.date()
YEAR_AGO = NOW - timedelta(days=365)

# --------------------------------------------------------------------------- #
# Reference data
# --------------------------------------------------------------------------- #
# Extra team members added on top of the existing @aurea.studio crew so the
# roster is ~10 people. (name, email, role, weekly_capacity, monthly_cost_eur,
# payments_grant, invites_grant)
_EXTRA_MEMBERS = [
    ("Miguel Tavares", "miguel@aurea.studio", "membro", 40, 3200, False, False),
    ("Joana Pires", "joana@aurea.studio", "gestor", 40, 3600, True, True),
    ("Pedro Almeida", "pedro@aurea.studio", "membro", 36, 2900, False, False),
    ("Ana Rocha", "ana@aurea.studio", "membro", 32, 2700, False, False),
]

_SECTORS = [
    "Publishing", "Hospitality", "Retail", "Healthcare", "Consulting",
    "Food & Beverage", "Real Estate", "Architecture", "Technology", "Education",
    "Fashion", "Non-profit", "Manufacturing", "Tourism", "Fitness",
]
_SOURCES = ["referral", "inbound", "event", "network", "cold", "social", "partner"]
_STATUS_WEIGHTS = [
    ("active", 0.48), ("partner", 0.14), ("potential", 0.22), ("inactive", 0.16),
]

_COMPANY_NAMES = [
    "Miolo Editora", "Verde Café", "Nortada Surf", "Clínica Serena",
    "Fábrica de Ideias", "Doce Lima", "Atlântico Imobiliária", "Lumen Arquitetos",
    "Horizonte Digital", "Casa da Serra", "Praia Norte Hotel", "Oficina do Pão",
    "Botânica Store", "Terra Viva", "Móvel & Cia", "Aurora Cosmética",
    "Ritmo Fitness", "Escola Crescer", "Vinha do Douro", "Porto Têxtil",
    "Nuvem Software", "Farol Consultores", "Jardim Secreto", "Onda Media",
    "Bica & Companhia", "Pedra & Cal", "Luz Fotografia", "Rota das Especiarias",
    "Colina Verde", "Maré Alta Eventos",
]

_FIRST_NAMES = [
    "Helena", "Tiago", "Marta", "Paulo", "Inês", "André", "Cláudia", "Nuno",
    "Rita", "Bruno", "Sara", "Filipe", "Catarina", "João", "Mariana", "Ricardo",
    "Beatriz", "Gonçalo", "Teresa", "Hugo", "Patrícia", "Vasco", "Luísa", "Diogo",
]
_LAST_NAMES = [
    "Vaz", "Brito", "Sousa", "Reis", "Cardoso", "Lima", "Melo", "Faria",
    "Costa", "Pereira", "Martins", "Gomes", "Rodrigues", "Silva", "Carvalho",
    "Fonseca", "Antunes", "Moreira", "Nogueira", "Teixeira",
]
_ROLE_TITLES = [
    "CEO", "Diretora de Marketing", "Fundador", "Diretor Criativo", "Sócio",
    "Gestora de Projeto", "Diretor Comercial", "Responsável de Comunicação",
    "Product Owner", "Proprietária",
]

_OPP_TEMPLATES = [
    "Rebranding {c}", "Website {c}", "Campanha {c}", "Identidade {c}",
    "Consultoria {c}", "Packaging {c}", "Portal {c}", "Brochura {c}",
    "App {c}", "Sinalética {c}", "Naming {c}", "Social Media {c}",
    "Vídeo institucional {c}", "Catálogo {c}", "Stand feira {c}",
]
_LOST_REASONS = [
    "Orçamento acima do budget do cliente.",
    "Cliente escolheu um concorrente.",
    "Projeto adiado internamente sem data.",
    "Sem resposta após vários follow-ups.",
    "Âmbito não compatível com o nosso posicionamento.",
]
_NEXT_ACTIONS = [
    "Enviar proposta revista", "Agendar reunião de apresentação",
    "Follow-up telefónico", "Preparar estimativa detalhada",
    "Validar âmbito com o cliente", "Enviar casos de estudo",
]

_PHASE_NAMES = ["Descoberta", "Estratégia", "Conceito", "Produção", "Entrega"]
_PROJECT_ROLES = ["designer", "copywriter", "developer", "art_director", "account"]
_TASK_TITLES = [
    "Briefing com cliente", "Pesquisa de referências", "Moodboard inicial",
    "Propostas de conceito", "Revisão interna", "Apresentação ao cliente",
    "Produção de artes finais", "Manual de marca", "Preparação de ficheiros",
    "Wireframes", "Protótipo interativo", "Desenvolvimento front-end",
    "Copywriting", "Revisão de texto", "Sessão fotográfica", "Edição de vídeo",
    "Testes de qualidade", "Entrega final", "Reunião de kickoff", "Estimativa de horas",
]
_INTERACTION_BODIES = {
    "call": [
        "Chamada de kickoff, cliente entusiasmado com a direção.",
        "Ligação para alinhar timings da próxima entrega.",
        "Chamada de follow-up sobre a proposta enviada.",
    ],
    "meeting": [
        "Reunião de apresentação de conceitos.",
        "Reunião de validação de moodboard.",
        "Reunião de ponto de situação do projeto.",
    ],
    "email": [
        "Envio de moodboard inicial para validação.",
        "Envio da proposta comercial atualizada.",
        "Resposta a dúvidas sobre o âmbito do trabalho.",
    ],
    "message": [
        "Mensagem rápida a confirmar a reunião de amanhã.",
        "Cliente pediu ajuste no logótipo por mensagem.",
    ],
    "note": [
        "Nota: cliente prefere paleta sóbria, evitar cores vivas.",
        "Nota interna: rever margem antes de fechar o contrato.",
        "Nota: decisor final é o diretor de marketing.",
    ],
    "followup": [
        "Follow-up agendado para rever a proposta.",
        "Follow-up: aguardar decisão do conselho até fim do mês.",
    ],
}
_COMMENT_BODIES = [
    "Ficou muito bom, avancemos para produção.",
    "Podemos rever o espaçamento no cabeçalho?",
    "Já tenho o feedback do cliente, atualizo amanhã.",
    "Falta apenas validar a paleta final.",
    "Boa! Marquei a revisão para sexta.",
    "Atenção ao prazo, estamos apertados esta semana.",
    "Concordo com a direção proposta.",
    "Deixo aqui as referências que falámos.",
]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _euros(amount: float) -> int:
    return round(amount * 100)


def _rand_dt(start: datetime, end: datetime) -> datetime:
    delta = end - start
    secs = random.randint(0, max(1, int(delta.total_seconds())))
    return start + timedelta(seconds=secs)


def _business_dt(d: date) -> datetime:
    """A plausible working-hours timestamp on a given date."""
    return datetime.combine(
        d, time(hour=random.randint(9, 18), minute=random.choice([0, 15, 30, 45])), UTC
    )


def _weighted_status() -> str:
    r = random.random()
    acc = 0.0
    for status, w in _STATUS_WEIGHTS:
        acc += w
        if r <= acc:
            return status
    return "active"


# --------------------------------------------------------------------------- #
# Wipe
# --------------------------------------------------------------------------- #
_WIPE_ORDER = [
    "activity_logs",
    "mentions",
    "comments",
    "notifications",
    "time_entries",
    "task_assignees",
    "task_checklist_items",
    "task_dependencies",
    "tasks",
    "milestones",
    "project_phases",
    "project_members",
    "payment_milestones",
    "project_costs",
    "interactions",
    "meetings",
    "proposals",
    "projects",
    "opportunities",
    "contacts",
    "companies",
]


def wipe_business_data(db: Session) -> None:
    # Break the circular project_phases <-> milestones FK before deleting.
    db.execute(text("UPDATE project_phases SET final_milestone_id = NULL"))
    for table in _WIPE_ORDER:
        db.execute(text(f"DELETE FROM {table}"))
    db.flush()


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #
def ensure_users(db: Session) -> tuple[User, list[User]]:
    """Ensure the login admin + full member roster exist. Returns (admin, all_users)."""
    admin = seed_admin(
        db,
        name=LOGIN_ADMIN_NAME,
        email=LOGIN_ADMIN_EMAIL,
        password=LOGIN_ADMIN_PASSWORD,
    )
    admin.role = "admin"
    admin.status = "active"
    if admin.internal_cost_rate is None:
        admin.internal_cost_rate = _euros(4200) // 160
    admin.weekly_capacity_hours = 40

    member_pw = os.getenv("SEED_DEMO_PASSWORD", LOGIN_ADMIN_PASSWORD)
    pw_hash = security.hash_password(member_pw)
    for name, email, role, cap, cost_eur, pay, inv in _EXTRA_MEMBERS:
        email = email.lower()
        existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing is not None:
            continue
        user = User(
            name=name,
            email=email,
            password_hash=pw_hash,
            role=role,
            status="active",
            weekly_capacity_hours=cap,
            internal_cost_rate=_euros(cost_eur) // 160,
            payments_grant=pay,
            invites_grant=inv,
        )
        db.add(user)
        db.flush()
        db.add(UserPreference(user_id=user.id))

    # Backfill capacity/cost on any pre-existing member missing it.
    all_users = list(db.execute(select(User).where(User.status == "active")).scalars())
    for u in all_users:
        if u.internal_cost_rate is None:
            u.internal_cost_rate = _euros(2800) // 160
    db.flush()
    return admin, all_users


# --------------------------------------------------------------------------- #
# CRM: companies, contacts
# --------------------------------------------------------------------------- #
def gen_companies(db: Session, users: list[User], admin: User) -> list[Company]:
    companies: list[Company] = []
    for name in _COMPANY_NAMES:
        status = _weighted_status()
        owner = random.choice(users)
        created = _rand_dt(YEAR_AGO, NOW - timedelta(days=30))
        company = Company(
            name=name,
            sector=random.choice(_SECTORS),
            website=f"https://{name.split()[0].lower()}.pt",
            email=f"geral@{name.split()[0].lower()}.pt",
            phone=f"+3512{random.randint(10000000, 99999999)}",
            source=random.choice(_SOURCES),
            owner_id=owner.id,
            status=status,
            is_active_client=status in ("active", "partner"),
            created_by=admin.id,
            created_at=created,
            updated_at=created,
        )
        db.add(company)
        companies.append(company)
    db.flush()
    return companies


def gen_contacts(
    db: Session, companies: list[Company], users: list[User], admin: User
) -> dict[str, list[Contact]]:
    by_company: dict[str, list[Contact]] = {}
    total = 0
    for company in companies:
        n = random.randint(1, 3)
        contacts: list[Contact] = []
        for _ in range(n):
            fn = random.choice(_FIRST_NAMES)
            ln = random.choice(_LAST_NAMES)
            slug = company.name.split()[0].lower()
            created = _rand_dt(company.created_at, NOW)
            contact = Contact(
                company_id=company.id,
                name=f"{fn} {ln}",
                role_title=random.choice(_ROLE_TITLES),
                email=f"{fn.lower()}.{ln.lower()}@{slug}.pt",
                phone=f"+3519{random.randint(10000000, 99999999)}",
                owner_id=company.owner_id,
                status="active" if random.random() > 0.1 else "inactive",
                created_by=admin.id,
                created_at=created,
                updated_at=created,
            )
            db.add(contact)
            contacts.append(contact)
            total += 1
        by_company[str(company.id)] = contacts
    db.flush()
    return by_company


# --------------------------------------------------------------------------- #
# CRM: opportunities
# --------------------------------------------------------------------------- #
def gen_opportunities(
    db: Session,
    companies: list[Company],
    contacts_by_company: dict[str, list[Contact]],
    stages: dict[str, PipelineStage],
    users: list[User],
    admin: User,
    count: int = 80,
) -> list[Opportunity]:
    stage_list = list(stages.values())
    stage_by_order = sorted(stage_list, key=lambda s: s.order_index)
    last_stage = stage_by_order[-1]
    opps: list[Opportunity] = []
    for _ in range(count):
        company = random.choice(companies)
        contacts = contacts_by_company.get(str(company.id)) or []
        contact = random.choice(contacts) if contacts else None
        owner = random.choice(users)
        created = _rand_dt(YEAR_AGO, NOW - timedelta(days=3))
        title = random.choice(_OPP_TEMPLATES).format(c=company.name.split()[0])
        value = _euros(random.choice([4, 6, 7.5, 9, 12, 14, 18, 22, 30, 45]) * 1000)

        r = random.random()
        if r < 0.46:
            outcome, prob, stage = "won", 100, last_stage
            close = (created + timedelta(days=random.randint(15, 90))).date()
            opp = Opportunity(
                company_id=company.id,
                primary_contact_id=contact.id if contact else None,
                owner_id=owner.id,
                stage_id=stage.id,
                title=title,
                estimated_value=value,
                probability=prob,
                expected_close_date=close,
                source=company.source,
                outcome=outcome,
                created_by=admin.id,
                created_at=created,
                updated_at=_business_dt(close),
            )
        elif r < 0.66:
            outcome, prob = "lost", 0
            stage = random.choice(stage_by_order[1:])
            lost_at = created + timedelta(days=random.randint(10, 80))
            opp = Opportunity(
                company_id=company.id,
                primary_contact_id=contact.id if contact else None,
                owner_id=owner.id,
                stage_id=stage.id,
                title=title,
                estimated_value=value,
                probability=prob,
                expected_close_date=lost_at.date(),
                source=company.source,
                outcome=outcome,
                lost_reason=random.choice(_LOST_REASONS),
                lost_at=lost_at,
                created_by=admin.id,
                created_at=created,
                updated_at=lost_at,
            )
        else:
            outcome = "open"
            stage = random.choice(stage_by_order)
            prob = stage.win_probability or random.randint(10, 80)
            due = TODAY + timedelta(days=random.randint(-5, 45))
            opp = Opportunity(
                company_id=company.id,
                primary_contact_id=contact.id if contact else None,
                owner_id=owner.id,
                stage_id=stage.id,
                title=title,
                estimated_value=value,
                probability=prob,
                expected_close_date=TODAY + timedelta(days=random.randint(10, 90)),
                source=company.source,
                outcome=outcome,
                next_action=random.choice(_NEXT_ACTIONS),
                next_action_due=due,
                created_by=admin.id,
                created_at=created,
                updated_at=_rand_dt(created, NOW),
            )
        db.add(opp)
        opps.append(opp)
    db.flush()
    return opps


# --------------------------------------------------------------------------- #
# CRM: proposals
# --------------------------------------------------------------------------- #
def gen_proposals(
    db: Session, opps: list[Opportunity], admin: User, count: int = 40
) -> list[Proposal]:
    proposals: list[Proposal] = []
    won = [o for o in opps if o.outcome == "won"]
    others = [o for o in opps if o.outcome != "won"]
    pool = won + others
    random.shuffle(pool)
    for i, opp in enumerate(pool[:count]):
        if opp.outcome == "won":
            status = "accepted"
        elif opp.outcome == "lost":
            status = random.choice(["rejected", "expired"])
        else:
            status = random.choice(["draft", "sent", "viewed", "sent", "viewed"])
        created_date = opp.created_at.date() + timedelta(days=random.randint(3, 20))
        sent_date = (
            created_date + timedelta(days=random.randint(1, 5))
            if status != "draft"
            else None
        )
        valid_until = created_date + timedelta(days=30)
        ref = f"PROP-{created_date.year}-{i + 1:03d}"
        proposal = Proposal(
            opportunity_id=opp.id,
            company_id=opp.company_id,
            contact_id=opp.primary_contact_id,
            reference=ref,
            value=opp.estimated_value,
            created_date=created_date,
            sent_date=sent_date,
            valid_until=valid_until,
            status=status,
            created_by=admin.id,
            created_at=_business_dt(created_date),
            updated_at=_business_dt(sent_date or created_date),
        )
        db.add(proposal)
        proposals.append(proposal)
    db.flush()
    return proposals


# --------------------------------------------------------------------------- #
# Projects, phases, members, tasks, time, milestones, costs
# --------------------------------------------------------------------------- #
# (status, health, age_band) — age_band picks the start-date window.
_PROJECT_PLAN = [
    ("completed", "healthy", "old"),
    ("completed", "healthy", "old"),
    ("completed", "attention", "old"),
    ("completed", "healthy", "mid"),
    ("completed", "at_risk", "mid"),
    ("active", "healthy", "recent"),
    ("active", "healthy", "recent"),
    ("active", "attention", "recent"),
    ("active", "at_risk", "recent"),
    ("active", "healthy", "mid"),
    ("active", "attention", "mid"),
    ("active", "healthy", "recent"),
    ("on_hold", "attention", "mid"),
    ("on_hold", "at_risk", "recent"),
    ("planning", "healthy", "recent"),
    ("planning", "healthy", "recent"),
    ("completed", "healthy", "mid"),
    ("active", "at_risk", "recent"),
    ("cancelled", "at_risk", "mid"),
    ("archived", "healthy", "old"),
]

_AGE_BANDS = {"old": (300, 365), "mid": (150, 300), "recent": (20, 150)}


def gen_projects(
    db: Session,
    opps: list[Opportunity],
    users: list[User],
    admin: User,
) -> list[Project]:
    won = [o for o in opps if o.outcome == "won"]
    random.shuffle(won)
    managers = [u for u in users if u.role in ("admin", "gestor")] or users
    projects: list[Project] = []

    for idx, (status, health, band) in enumerate(_PROJECT_PLAN):
        opp = won[idx] if idx < len(won) else random.choice(won)
        lo, hi = _AGE_BANDS[band]
        start = TODAY - timedelta(days=random.randint(lo, hi))
        duration = random.randint(45, 160)
        deadline = start + timedelta(days=duration)
        contracted = opp.estimated_value or _euros(random.randint(6, 30) * 1000)
        manager = random.choice(managers)
        pub_health = health
        health_reason = None
        if health != "healthy":
            health_reason = (
                "Prazo apertado face ao âmbito atual."
                if health == "at_risk"
                else "Aguardar validação do cliente para avançar."
            )
        status_reason = None
        if status in ("on_hold", "cancelled"):
            status_reason = (
                "Projeto suspenso a pedido do cliente."
                if status == "on_hold"
                else "Cancelado por reestruturação do lado do cliente."
            )
        created = _business_dt(start)
        project = Project(
            company_id=opp.company_id,
            opportunity_id=opp.id,
            name=opp.title.replace("Website ", "Site ").split(" para ")[0],
            manager_id=manager.id,
            description="Projeto criativo para " + opp.title,
            start_date=start,
            deadline=deadline,
            contracted_value=contracted,
            hours_budget=random.choice([120, 160, 200, 240, 300]),
            internal_cost_rate=_euros(35),
            status=status,
            suggested_health=health,
            published_health=pub_health,
            health_reason=health_reason,
            health_published_at=NOW - timedelta(days=random.randint(1, 20)),
            health_published_by=manager.id,
            status_reason=status_reason,
            archived_at=NOW - timedelta(days=random.randint(1, 30))
            if status == "archived"
            else None,
            created_by=admin.id,
            created_at=created,
            updated_at=created,
        )
        db.add(project)
        db.flush()
        projects.append(project)

        _gen_project_members(db, project, manager, users, admin)
        phases = _gen_phases(db, project, status, start, deadline, manager, admin)
        _gen_tasks(db, project, phases, status, start, deadline, admin)
        _gen_payment_milestones(db, project, status, start, deadline, manager, admin)
        _gen_project_costs(db, project, start, admin)
    return projects


def _gen_project_members(
    db: Session, project: Project, manager: User, users: list[User], admin: User
) -> list[User]:
    pool = [u for u in users if u.id != manager.id]
    random.shuffle(pool)
    members = [manager] + pool[: random.randint(2, 4)]
    for user in members:
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=user.id,
                role_in_project="manager"
                if user.id == manager.id
                else random.choice(_PROJECT_ROLES),
                created_by=admin.id,
                created_at=project.created_at,
                updated_at=project.created_at,
            )
        )
    db.flush()
    project._members = members  # type: ignore[attr-defined]
    return members


def _gen_phases(
    db: Session,
    project: Project,
    status: str,
    start: date,
    deadline: date,
    manager: User,
    admin: User,
) -> list[ProjectPhase]:
    n = random.randint(3, 5)
    names = _PHASE_NAMES[:n]
    span = (deadline - start).days
    step = max(1, span // n)
    phases: list[ProjectPhase] = []
    for i, name in enumerate(names):
        p_start = start + timedelta(days=i * step)
        p_deadline = start + timedelta(days=(i + 1) * step)
        if status in ("completed", "archived"):
            p_status, progress = "completed", 100
        elif status == "planning":
            p_status, progress = "not_started", 0
        else:  # active / on_hold / cancelled
            if p_deadline <= TODAY:
                p_status, progress = "completed", 100
            elif p_start <= TODAY < p_deadline:
                p_status, progress = "in_progress", random.randint(30, 70)
            else:
                p_status, progress = "not_started", 0
        created = _business_dt(p_start)
        phase = ProjectPhase(
            project_id=project.id,
            name=name,
            owner_id=manager.id,
            start_date=p_start,
            deadline=p_deadline,
            order_index=i,
            progress=progress,
            status=p_status,
            created_by=admin.id,
            created_at=created,
            updated_at=created,
        )
        db.add(phase)
        phases.append(phase)
    db.flush()
    return phases


def _task_status_for(project_status: str, phase_status: str) -> str:
    if project_status in ("completed", "archived"):
        return "done"
    if project_status == "planning":
        return random.choice(["todo", "todo", "in_progress"])
    if project_status == "cancelled":
        return random.choice(["done", "todo", "blocked"])
    # active / on_hold
    if phase_status == "completed":
        return "done"
    if phase_status == "in_progress":
        return random.choice(["done", "in_progress", "in_progress", "in_review", "blocked", "todo"])
    return random.choice(["todo", "todo", "in_progress"])


def _gen_tasks(
    db: Session,
    project: Project,
    phases: list[ProjectPhase],
    project_status: str,
    start: date,
    deadline: date,
    admin: User,
) -> None:
    members: list[User] = getattr(project, "_members", [])
    if not members:
        return
    n = random.randint(15, 26)
    project._tasks = []  # type: ignore[attr-defined]
    for _ in range(n):
        phase = random.choice(phases)
        t_status = _task_status_for(project_status, phase.status)
        assignee = random.choice(members)
        priority = random.choices(
            ["low", "normal", "high", "urgent"], weights=[2, 5, 3, 1]
        )[0]
        estimate = random.choice([2, 4, 6, 8, 12, 16])
        t_start = phase.start_date or start

        if t_status == "done":
            done_at = _rand_dt(
                _business_dt(t_start),
                min(NOW, _business_dt(phase.deadline or deadline)),
            )
            due = (done_at + timedelta(days=random.randint(-3, 2))).date()
            created_at = done_at - timedelta(days=random.randint(3, 20))
            updated_at = done_at
        else:
            created_at = _business_dt(t_start)
            # Spread due dates: overdue, this week, upcoming, future.
            due = TODAY + timedelta(days=random.choice(
                [-14, -7, -3, -1, 0, 0, 1, 2, 3, 5, 7, 10, 14, 21]
            ))
            updated_at = _rand_dt(created_at, NOW)

        block_reason = (
            "A aguardar aprovação de conteúdos do cliente."
            if t_status == "blocked"
            else None
        )
        task = Task(
            project_id=project.id,
            phase_id=phase.id,
            title=random.choice(_TASK_TITLES),
            description="Tarefa do projeto " + project.name,
            primary_assignee_id=assignee.id,
            priority=priority,
            start_date=t_start,
            due_date=due,
            estimate_hours=estimate,
            status=t_status,
            block_reason=block_reason,
            created_by=admin.id,
            created_at=created_at,
            updated_at=updated_at,
        )
        db.add(task)
        db.flush()
        db.add(
            TaskAssignee(
                task_id=task.id,
                user_id=assignee.id,
                created_by=admin.id,
                created_at=created_at,
                updated_at=created_at,
            )
        )
        project._tasks.append(task)  # type: ignore[attr-defined]
    db.flush()


def _gen_payment_milestones(
    db: Session,
    project: Project,
    project_status: str,
    start: date,
    deadline: date,
    manager: User,
    admin: User,
) -> None:
    total = project.contracted_value or 0
    n = random.choice([2, 2, 3])
    if n == 2:
        splits = [0.5, 0.5]
        labels = ["Adiantamento (50%)", "Entrega final (50%)"]
    else:
        splits = [0.4, 0.3, 0.3]
        labels = ["Adiantamento (40%)", "Fase intermédia (30%)", "Entrega final (30%)"]

    span = (deadline - start).days
    for i, (frac, label) in enumerate(zip(splits, labels, strict=True)):
        amount = round(total * frac)
        expected = start + timedelta(days=round(span * (i + 1) / n))
        # Decide status from timeline + project state.
        if project_status in ("completed", "archived"):
            status, paid = "paid", amount
        elif expected < TODAY - timedelta(days=45):
            status, paid = ("paid", amount) if random.random() > 0.2 else ("overdue", 0)
        elif expected < TODAY:
            status, paid = random.choice(
                [("paid", amount), ("overdue", 0), ("partially_paid", amount // 2), ("invoiced", 0)]
            )
        else:
            status, paid = random.choice([("planned", 0), ("planned", 0), ("invoiced", 0)])

        invoiced_date = None
        paid_date = None
        confirmer = None
        if status in ("paid", "partially_paid"):
            invoiced_date = expected - timedelta(days=random.randint(2, 10))
            paid_date = expected + timedelta(days=random.randint(-3, 15))
            if paid_date > TODAY:
                paid_date = TODAY
            confirmer = manager.id
        elif status in ("invoiced", "overdue"):
            invoiced_date = expected - timedelta(days=random.randint(2, 10))

        db.add(
            PaymentMilestone(
                project_id=project.id,
                company_id=project.company_id,
                description=label,
                amount=amount,
                received_amount=paid,
                expected_date=expected,
                invoiced_date=invoiced_date,
                paid_date=paid_date,
                confirmer_id=confirmer,
                external_invoice_ref=f"FT-{expected.year}-{random.randint(100, 999)}"
                if invoiced_date
                else None,
                reference=f"REF-{project.name[:4].upper()}-{i + 1}",
                status=status,
                created_by=admin.id,
                created_at=_business_dt(expected - timedelta(days=15)),
                updated_at=_business_dt(paid_date or invoiced_date or expected),
            )
        )
    db.flush()


def _gen_project_costs(db: Session, project: Project, start: date, admin: User) -> None:
    for _ in range(random.randint(1, 4)):
        d = start + timedelta(days=random.randint(0, 90))
        if d > TODAY:
            d = TODAY
        db.add(
            ProjectCost(
                project_id=project.id,
                description=random.choice(
                    ["Licenças de software", "Fotografia externa", "Impressão",
                     "Freelancer ilustração", "Stock de imagens", "Alojamento web"]
                ),
                amount=_euros(random.randint(50, 1200)),
                date=d,
                created_by=admin.id,
                created_at=_business_dt(d),
                updated_at=_business_dt(d),
            )
        )
    db.flush()


# --------------------------------------------------------------------------- #
# Time entries
# --------------------------------------------------------------------------- #
def gen_time_entries(
    db: Session, projects: list[Project], admin: User
) -> int:
    count = 0
    for project in projects:
        tasks: list[Task] = getattr(project, "_tasks", [])
        for task in tasks:
            if task.status == "todo":
                continue
            n_entries = (
                random.randint(1, 4) if task.status == "done" else random.randint(1, 3)
            )
            user_id = task.primary_assignee_id
            if user_id is None:
                continue
            base = task.created_at
            end_bound = task.updated_at if task.status == "done" else NOW
            for _ in range(n_entries):
                started = _rand_dt(
                    base, max(base + timedelta(hours=1), end_bound - timedelta(hours=6))
                )
                started = started.replace(
                    minute=random.choice([0, 15, 30, 45]), second=0, microsecond=0
                )
                hours = random.choice([1, 1.5, 2, 3, 4])
                ended = started + timedelta(hours=hours)
                if ended > NOW:
                    ended = NOW
                db.add(
                    TimeEntry(
                        user_id=user_id,
                        task_id=task.id,
                        started_at=started,
                        ended_at=ended,
                        description=random.choice(
                            ["Produção", "Revisão", "Reunião", "Pesquisa", "Ajustes finais"]
                        ),
                        billable=random.random() > 0.15,
                        created_by=admin.id,
                        created_at=started,
                        updated_at=ended,
                    )
                )
                count += 1
    db.flush()
    return count


def gen_running_timers(db: Session, projects: list[Project], users: list[User]) -> None:
    """A couple of currently-running timers (ended_at NULL). At most one per user."""
    candidate_tasks: list[Task] = []
    for project in projects:
        if project.status not in ("active", "on_hold", "planning"):
            continue
        for task in getattr(project, "_tasks", []):
            if task.status in ("in_progress", "in_review"):
                candidate_tasks.append(task)
    random.shuffle(candidate_tasks)
    used_users: set = set()
    started_pool = 0
    for task in candidate_tasks:
        uid = task.primary_assignee_id
        if uid is None or uid in used_users:
            continue
        used_users.add(uid)
        db.add(
            TimeEntry(
                user_id=uid,
                task_id=task.id,
                started_at=NOW - timedelta(minutes=random.randint(15, 180)),
                ended_at=None,
                description="Em curso",
                billable=True,
                created_by=uid,
            )
        )
        started_pool += 1
        if started_pool >= 4:
            break
    db.flush()


# --------------------------------------------------------------------------- #
# Interactions, meetings
# --------------------------------------------------------------------------- #
def gen_interactions(
    db: Session,
    companies: list[Company],
    opps: list[Opportunity],
    users: list[User],
    admin: User,
    count: int = 150,
) -> int:
    opp_by_company: dict[str, list[Opportunity]] = {}
    for o in opps:
        opp_by_company.setdefault(str(o.company_id), []).append(o)
    for _ in range(count):
        company = random.choice(companies)
        itype = random.choice(list(_INTERACTION_BODIES.keys()))
        opp_choices = opp_by_company.get(str(company.id))
        opp = random.choice(opp_choices) if opp_choices and random.random() > 0.3 else None
        occurred = _rand_dt(YEAR_AGO, NOW)
        db.add(
            Interaction(
                type=itype,
                company_id=company.id,
                opportunity_id=opp.id if opp else None,
                body=random.choice(_INTERACTION_BODIES[itype]),
                occurred_at=occurred,
                user_id=random.choice(users).id,
                created_by=admin.id,
                created_at=occurred,
                updated_at=occurred,
            )
        )
    db.flush()
    return count


def gen_meetings(
    db: Session,
    projects: list[Project],
    companies: list[Company],
    admin: User,
    users: list[User],
) -> int:
    count = 0
    # Past held meetings across the year.
    for _ in range(20):
        start = _rand_dt(YEAR_AGO, NOW - timedelta(days=1))
        company = random.choice(companies)
        db.add(
            Meeting(
                title=random.choice(
                    ["Kickoff", "Apresentação de conceitos", "Ponto de situação",
                     "Validação de proposta", "Revisão final"]
                )
                + " — "
                + company.name,
                start_at=start,
                end_at=start + timedelta(hours=1),
                organizer_id=random.choice(users).id,
                company_id=company.id,
                status="held",
                outcome_note="Reunião realizada com sucesso.",
                created_by=admin.id,
                created_at=start - timedelta(days=3),
                updated_at=start,
            )
        )
        count += 1
    # Upcoming meetings (some organised by the login admin for the daily hub).
    active_projects = [p for p in projects if p.status in ("active", "on_hold", "planning")]
    for i in range(10):
        start = NOW + timedelta(days=random.randint(0, 14), hours=random.randint(-4, 6))
        organizer = admin if i < 5 else random.choice(users)
        project = random.choice(active_projects) if active_projects else None
        db.add(
            Meeting(
                title=random.choice(
                    ["Reunião de acompanhamento", "Revisão de entregáveis",
                     "Briefing", "Sessão de trabalho"]
                ),
                start_at=start,
                end_at=start + timedelta(hours=1),
                organizer_id=organizer.id,
                company_id=project.company_id if project else random.choice(companies).id,
                project_id=project.id if project else None,
                status="scheduled",
                created_by=admin.id,
                created_at=NOW - timedelta(days=random.randint(1, 5)),
                updated_at=NOW,
            )
        )
        count += 1
    db.flush()
    return count


# --------------------------------------------------------------------------- #
# Comments + mentions + notifications + activity log
# --------------------------------------------------------------------------- #
def gen_comments_mentions(
    db: Session,
    projects: list[Project],
    admin: User,
    users: list[User],
    count: int = 100,
) -> tuple[int, int]:
    all_tasks: list[Task] = []
    for p in projects:
        all_tasks.extend(getattr(p, "_tasks", []))
    n_comments = 0
    n_mentions = 0
    for _ in range(count):
        if all_tasks and random.random() > 0.35:
            entity_type, entity = "task", random.choice(all_tasks)
        else:
            entity_type, entity = "project", random.choice(projects)
        author = random.choice(users)
        created = _rand_dt(entity.created_at, NOW)
        mention_user = random.choice(users) if random.random() > 0.5 else None
        body = random.choice(_COMMENT_BODIES)
        if mention_user is not None:
            body = f"@{mention_user.name.split()[0]} {body}"
        comment = Comment(
            entity_type=entity_type,
            entity_id=entity.id,
            author_id=author.id,
            body=body,
            created_by=author.id,
            created_at=created,
            updated_at=created,
        )
        db.add(comment)
        db.flush()
        n_comments += 1
        if mention_user is not None and mention_user.id != author.id:
            db.add(
                Mention(
                    comment_id=comment.id,
                    mentioned_user_id=mention_user.id,
                    created_by=author.id,
                    created_at=created,
                    updated_at=created,
                )
            )
            n_mentions += 1
    db.flush()
    return n_comments, n_mentions


def gen_login_admin_extras(
    db: Session, admin: User, projects: list[Project], users: list[User]
) -> None:
    """Guarantee the login admin has populated personal views regardless of
    random assignment: open tasks bucketed by due date, time entries this week,
    mentions, and notifications."""
    # Projects the admin belongs to (as member) so my-work project cards show.
    admin_projects = [
        p for p in projects
        if p.status in ("active", "on_hold", "planning")
    ][:6]
    for p in admin_projects:
        exists = db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == p.id, ProjectMember.user_id == admin.id
            )
        ).scalar_one_or_none()
        if exists is None:
            db.add(
                ProjectMember(
                    project_id=p.id, user_id=admin.id, role_in_project="account",
                    created_by=admin.id, created_at=p.created_at, updated_at=p.created_at,
                )
            )
    db.flush()

    # Guaranteed open tasks for the admin, spread across the daily-hub buckets.
    # Kept small: net capacity for an Admin is only capacity×0.40, so a handful
    # of open tasks already realistically fills "O meu trabalho". The workload
    # rebalance pass later trims the tail; these seed the buckets (overdue /
    # today / upcoming / someday) so the personal hub never renders empty.
    hub_tasks = [
        (-3, "in_progress"), (0, "todo"), (0, "in_review"),
        (2, "in_progress"), (5, "todo"), (10, "todo"),
        (12, "in_progress"), (None, "todo"),
    ]
    hub_projects = admin_projects[:3] or admin_projects
    for i, (off, st) in enumerate(hub_tasks):
        p = hub_projects[i % len(hub_projects)] if hub_projects else None
        if p is None:
            break
        phases = db.execute(
            select(ProjectPhase).where(ProjectPhase.project_id == p.id)
        ).scalars().all()
        phase = random.choice(phases) if phases else None
        due = TODAY + timedelta(days=off) if off is not None else None
        created = NOW - timedelta(days=random.randint(2, 30))
        task = Task(
            project_id=p.id,
            phase_id=phase.id if phase else None,
            title=random.choice(_TASK_TITLES),
            description="Tarefa atribuída ao utilizador interno.",
            primary_assignee_id=admin.id,
            priority=random.choice(["normal", "high", "urgent", "low"]),
            start_date=(created - timedelta(days=2)).date(),
            due_date=due,
            # Small estimates so several fit inside the Admin's modest net
            # capacity — the daily hub stays populated without over-allocating.
            estimate_hours=random.choice([2, 3, 4]),
            status=st,
            created_by=admin.id,
            created_at=created,
            updated_at=created,
        )
        db.add(task)
        db.flush()
        db.add(TaskAssignee(task_id=task.id, user_id=admin.id, created_by=admin.id,
                            created_at=created, updated_at=created))
        p._tasks.append(task)  # type: ignore[attr-defined]
    db.flush()

    # Done tasks in the past for history + time entries.
    for p in admin_projects[:4]:
        for _ in range(4):
            done_at = NOW - timedelta(days=random.randint(3, 120))
            created = done_at - timedelta(days=random.randint(3, 15))
            task = Task(
                project_id=p.id,
                title=random.choice(_TASK_TITLES),
                primary_assignee_id=admin.id,
                priority="normal",
                due_date=done_at.date(),
                estimate_hours=random.choice([2, 4, 6]),
                status="done",
                created_by=admin.id,
                created_at=created,
                updated_at=done_at,
            )
            db.add(task)
            db.flush()
            db.add(TaskAssignee(task_id=task.id, user_id=admin.id, created_by=admin.id,
                                created_at=created, updated_at=done_at))
            for _ in range(random.randint(1, 3)):
                started = _rand_dt(created, done_at).replace(
                    minute=0, second=0, microsecond=0
                )
                db.add(TimeEntry(
                    user_id=admin.id, task_id=task.id,
                    started_at=started,
                    ended_at=started + timedelta(hours=random.choice([1, 2, 3])),
                    description="Trabalho concluído", billable=True,
                    created_by=admin.id, created_at=started, updated_at=started,
                ))

    # Time entries in the CURRENT ISO week (drives utilization).
    week_start = NOW - timedelta(days=NOW.weekday())
    admin_tasks = list(db.execute(
        select(Task).where(Task.primary_assignee_id == admin.id, Task.status != "done")
    ).scalars().all())
    for _ in range(6):
        if not admin_tasks:
            break
        task = random.choice(admin_tasks)
        day = week_start + timedelta(days=random.randint(0, min(NOW.weekday(), 4)))
        started = day.replace(
            hour=random.randint(9, 15), minute=0, second=0, microsecond=0
        )
        if started > NOW:
            started = NOW - timedelta(hours=2)
        db.add(TimeEntry(
            user_id=admin.id, task_id=task.id,
            started_at=started, ended_at=started + timedelta(hours=random.choice([1, 2, 3])),
            description="Sessão da semana", billable=True,
            created_by=admin.id, created_at=started, updated_at=started,
        ))
    db.flush()

    # Mentions of the admin (drives the @mentions panel).
    admin_tasks_all = db.execute(
        select(Task).where(Task.primary_assignee_id == admin.id)
    ).scalars().all()
    for _ in range(6):
        if not admin_tasks_all:
            break
        task = random.choice(admin_tasks_all)
        author = random.choice([u for u in users if u.id != admin.id])
        created = NOW - timedelta(days=random.randint(0, 10))
        comment = Comment(
            entity_type="task", entity_id=task.id, author_id=author.id,
            body=f"@{admin.name.split()[0]} podes dar uma vista de olhos nisto?",
            created_by=author.id, created_at=created, updated_at=created,
        )
        db.add(comment)
        db.flush()
        db.add(Mention(comment_id=comment.id, mentioned_user_id=admin.id,
                       created_by=author.id, created_at=created, updated_at=created))
    db.flush()


def gen_notifications(
    db: Session, admin: User, users: list[User], projects: list[Project]
) -> int:
    """Recent notifications for the login users, heavily weighted to the admin."""
    types = ["task_assigned", "mention", "comment", "milestone_paid",
             "project_health", "proposal_accepted", "review_requested"]
    count = 0
    targets = [admin, admin, admin] + users  # bias toward admin
    for _ in range(45):
        user = random.choice(targets)
        ntype = random.choice(types)
        created = NOW - timedelta(days=random.randint(0, 21), hours=random.randint(0, 23))
        roll = random.random()
        read_at = None
        archived_at = None
        if roll < 0.45:
            pass  # unread
        elif roll < 0.85:
            read_at = created + timedelta(hours=random.randint(1, 48))
        else:
            read_at = created + timedelta(hours=2)
            archived_at = created + timedelta(days=1)
        project = random.choice(projects)
        db.add(
            Notification(
                user_id=user.id,
                type=ntype,
                entity_type="project",
                entity_id=project.id,
                body={
                    "task_assigned": "Foi-lhe atribuída uma nova tarefa.",
                    "mention": "Mencionaram-no num comentário.",
                    "comment": "Novo comentário num projeto que segue.",
                    "milestone_paid": "Um pagamento foi confirmado.",
                    "project_health": "A saúde de um projeto foi atualizada.",
                    "proposal_accepted": "Uma proposta foi aceite.",
                    "review_requested": "Uma tarefa aguarda a sua revisão.",
                }[ntype],
                read_at=read_at,
                archived_at=archived_at,
                created_at=created,
                updated_at=read_at or created,
            )
        )
        count += 1
    db.flush()
    return count


def gen_activity_logs(
    db: Session,
    admin: User,
    users: list[User],
    projects: list[Project],
    opps: list[Opportunity],
    companies: list[Company],
) -> int:
    count = 0
    actions_project = ["project.created", "project.status_changed", "project.health_published"]
    actions_task = ["task.created", "task.status_changed", "task.completed", "task.assigned"]
    actions_opp = [
        "opportunity.created", "opportunity.won",
        "opportunity.lost", "opportunity.stage_changed",
    ]
    actions_pay = ["payment.recorded", "payment.invoiced"]

    def _log(entity_type, entity_id, action, occurred):
        nonlocal count
        db.add(
            ActivityLog(
                entity_type=entity_type,
                entity_id=entity_id,
                actor_id=random.choice(users).id,
                action=action,
                occurred_at=occurred,
                created_by=admin.id,
                created_at=occurred,
                updated_at=occurred,
            )
        )
        count += 1

    for p in projects:
        _log("project", p.id, "project.created", p.created_at)
        for _ in range(random.randint(2, 5)):
            _log("project", p.id, random.choice(actions_project), _rand_dt(p.created_at, NOW))
        for t in getattr(p, "_tasks", [])[:6]:
            _log("task", t.id, random.choice(actions_task), _rand_dt(t.created_at, NOW))
    for o in opps:
        action = {"won": "opportunity.won", "lost": "opportunity.lost"}.get(
            o.outcome, random.choice(actions_opp)
        )
        _log("opportunity", o.id, action, _rand_dt(o.created_at, NOW))
    for c in random.sample(companies, min(15, len(companies))):
        _log("company", c.id, "company.created", c.created_at)
    for p in projects[:12]:
        _log("payment_milestone", p.id, random.choice(actions_pay), _rand_dt(p.created_at, NOW))
    db.flush()
    return count


# --------------------------------------------------------------------------- #
# Workload rebalance (keeps CURRENT load believable while history stays rich)
# --------------------------------------------------------------------------- #
def _mark_done_historical(task: Task) -> None:
    """Flip an OPEN task to a completed one with a plausible PAST timeline.

    Anchored to the task's own ``created_at`` so completion dates spread across
    the whole ~12-month window (created_at already spans the year), keeping the
    done-task history — and the time entries built from it — realistic.
    """
    anchor = task.created_at
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=UTC)
    latest = min(NOW - timedelta(days=1), anchor + timedelta(days=60))
    if latest <= anchor:
        latest = anchor + timedelta(days=1)
    done_at = _rand_dt(anchor, latest)
    task.status = "done"
    task.block_reason = None
    task.updated_at = done_at
    task.due_date = (done_at + timedelta(days=random.randint(-3, 2))).date()


def rebalance_workload(db: Session, admin: User) -> None:
    """Cap each active member's OPEN-task load to a believable slice of their
    net capacity, flipping the excess to historical ``done``; then globally tune
    overdue and blocked counts.

    Net capacity mirrors ``workload_service``: ``weekly_capacity × role_target``.
    Most members land ~55–105% of that; one or two run "hot" (~115–130%) so the
    over-allocated (red) state still demos. Members with too few open tasks stay
    naturally under target — a realistic spread, never the ~579% blow-up.
    """
    active = list(
        db.execute(select(User).where(User.status == "active")).scalars()
    )
    # Pick the two "hot" (over-allocated) members from those with the LARGEST
    # open-task pools, so they can actually reach ~115–130% and the red zone
    # demos — a random pick can land on a thin pool that undershoots.
    pool_hours = {
        u.id: db.scalar(
            select(func.coalesce(func.sum(Task.estimate_hours), 0)).where(
                Task.primary_assignee_id == u.id,
                Task.archived_at.is_(None),
                Task.status != "done",
                Task.estimate_hours.is_not(None),
            )
        )
        or 0
        for u in active
    }
    # The login/demo admin stays comfortably in-band — never the red member.
    ranked = sorted(
        (u for u in active if u.id != admin.id),
        key=lambda u: float(pool_hours[u.id]),
        reverse=True,
    )
    hot_ids = {u.id for u in ranked[:2]}

    for user in active:
        capacity = float(user.weekly_capacity_hours or 0.0)
        net_capacity = capacity * _role_target(user.role)
        factor = (
            random.uniform(1.14, 1.24) if user.id in hot_ids
            else random.uniform(0.55, 1.00)
        )
        desired_hours = net_capacity * factor
        # Cap overshoot to ~6% of net capacity so a single big task can never
        # blow a member past the target band (keeps hot members ≤ ~130%).
        slack = 0.06 * net_capacity
        open_tasks = list(
            db.execute(
                select(Task)
                .where(
                    Task.primary_assignee_id == user.id,
                    Task.archived_at.is_(None),
                    Task.status != "done",
                    Task.estimate_hours.is_not(None),
                )
                .order_by(Task.created_at.asc())
            ).scalars()
        )
        # Keep a believable slice of open tasks up to the desired load; the rest
        # become completed history. Randomise which stay open for variety — but
        # for the login admin, keep the smallest tasks first so its modest net
        # capacity holds several items (a well-populated daily hub).
        if user.id == admin.id:
            open_tasks.sort(key=lambda t: float(t.estimate_hours or 0.0))
        else:
            random.shuffle(open_tasks)
        acc = 0.0
        for task in open_tasks:
            est = float(task.estimate_hours or 0.0)
            if acc + est <= desired_hours + slack:
                acc += est
            else:
                _mark_done_historical(task)
    db.flush()

    # ---- Global tuning across every remaining OPEN task -------------------- #
    remaining = list(
        db.execute(
            select(Task).where(
                Task.archived_at.is_(None), Task.status != "done"
            )
        ).scalars()
    )

    # Due dates: default everything with a due date to now/soon...
    for task in remaining:
        if task.due_date is not None:
            task.due_date = TODAY + timedelta(days=random.randint(0, 21))

    # ...then make only a believable handful genuinely overdue. Guarantee the
    # login admin owns at least one so the personal daily-hub "overdue" bucket
    # renders, and spread the remainder across the whole operation.
    dated = [t for t in remaining if t.due_date is not None]
    random.shuffle(dated)
    admin_dated = [t for t in dated if t.primary_assignee_id == admin.id]
    overdue: list[Task] = []
    if admin_dated:
        overdue.append(admin_dated[0])
    target_overdue = random.randint(9, 13)
    for task in dated:
        if len(overdue) >= target_overdue:
            break
        if task not in overdue:
            overdue.append(task)
    for task in overdue:
        task.due_date = TODAY - timedelta(days=random.randint(1, 14))

    # Blocked: keep a small realistic number (3–6).
    blocked = [t for t in remaining if t.status == "blocked"]
    random.shuffle(blocked)
    keep_blocked = random.randint(3, 5)
    for task in blocked[keep_blocked:]:
        task.status = random.choice(["in_progress", "todo", "in_review"])
        task.block_reason = None
    if len(blocked) < 3:
        pool = [
            t for t in remaining
            if t.status in ("in_progress", "todo") and t not in blocked
        ]
        random.shuffle(pool)
        for task in pool[: 3 - len(blocked)]:
            task.status = "blocked"
            task.block_reason = "A aguardar aprovação de conteúdos do cliente."
    db.flush()


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def run_rich_seed(db: Session) -> dict:
    random.seed(SEED)
    admin, users = ensure_users(db)
    wipe_business_data(db)

    stages = seed_stages(db, admin.id)
    companies = gen_companies(db, users, admin)
    contacts_by_company = gen_contacts(db, companies, users, admin)
    opps = gen_opportunities(db, companies, contacts_by_company, stages, users, admin)
    proposals = gen_proposals(db, opps, admin)
    projects = gen_projects(db, opps, users, admin)
    # Admin personal tasks first, THEN cap current open load to a believable
    # band (flipping the excess to historical done), THEN build time entries so
    # the ~12-month logged-work history reflects the final task statuses.
    gen_login_admin_extras(db, admin, projects, users)
    rebalance_workload(db, admin)
    n_time = gen_time_entries(db, projects, admin)
    gen_running_timers(db, projects, users)
    n_interactions = gen_interactions(db, companies, opps, users, admin)
    n_meetings = gen_meetings(db, projects, companies, admin, users)
    n_comments, n_mentions = gen_comments_mentions(db, projects, admin, users)
    n_notifications = gen_notifications(db, admin, users, projects)
    n_activity = gen_activity_logs(db, admin, users, projects, opps, companies)

    return {
        "login_admin": admin.email,
        "users": len(users),
        "companies": len(companies),
        "opportunities": len(opps),
        "proposals": len(proposals),
        "projects": len(projects),
        "time_entries": n_time,
        "interactions": n_interactions,
        "meetings": n_meetings,
        "comments": n_comments,
        "mentions": n_mentions,
        "notifications": n_notifications,
        "activity_logs": n_activity,
    }


def main(argv: list[str] | None = None) -> int:
    if os.getenv("ENVIRONMENT", "").strip().lower() != "development":
        print(
            "error: seed_rich is a DEV-ONLY generator; set ENVIRONMENT=development.",
            file=sys.stderr,
        )
        return 2
    db = SessionLocal()
    try:
        summary = run_rich_seed(db)
        db.commit()
    except Exception as exc:  # noqa: BLE001 — surface any failure to the operator
        db.rollback()
        print(f"error: rich seed failed — {exc}", file=sys.stderr)
        raise
    finally:
        db.close()

    print("rich seed complete (wiped + regenerated):")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    print(f"  login: {LOGIN_ADMIN_EMAIL} / {LOGIN_ADMIN_PASSWORD} (dev)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
