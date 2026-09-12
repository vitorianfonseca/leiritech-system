"""Catalog and template master data for LeiriTech.

Idempotent by name: running it twice updates nothing and inserts nothing new,
so it is safe to re-run after a deploy or alongside the demo seed.

The content is a real software-house offer, not filler — the units, the
billing types and the price bands are the ones this kind of studio actually
quotes with, so the catalogue is usable on day one rather than a placeholder
someone has to clear out first. Prices are integer EUR cents; `tax_rate` is
the Portuguese standard rate unless the line is genuinely exempt.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogItem
from app.models.project import ProjectTemplate, TemplatePhase, TemplateTask
from app.models.proposal_content import (
    ProposalTemplate,
    ProposalTemplateItem,
    ProposalTemplateSection,
)

VAT = Decimal("23.00")

# (name, category, unit, unit_price_cents, billing_type, description)
CATALOG: list[tuple[str, str, str, int, str, str]] = [
    # ---- Descoberta e estratégia ----
    (
        "Workshop de descoberta",
        "Estratégia",
        "day",
        95_000,
        "one_time",
        "Sessão de um dia com o cliente para levantar objetivos, utilizadores e âmbito. Termina "
        "com"
        "um resumo escrito e uma lista priorizada.",
    ),
    (
        "Auditoria técnica",
        "Estratégia",
        "fixed",
        180_000,
        "one_time",
        "Revisão de um sistema existente: arquitetura, dependências, segurança e dívida técnica. "
        "Entrega relatório com plano de remediação.",
    ),
    (
        "Consultoria técnica",
        "Estratégia",
        "hour",
        9_500,
        "one_time",
        "Acompanhamento pontual fora de projeto — decisões de arquitetura, revisão de código, "
        "apoio"
        "a concursos.",
    ),
    # ---- Design ----
    (
        "Design de interface (UI)",
        "Design",
        "day",
        68_000,
        "one_time",
        "Desenho de ecrãs em alta fidelidade a partir do sistema de design, prontos para "
        "implementação.",
    ),
    (
        "Investigação de utilizador (UX)",
        "Design",
        "day",
        72_000,
        "one_time",
        "Entrevistas, testes de usabilidade e síntese de conclusões acionáveis.",
    ),
    (
        "Sistema de design",
        "Design",
        "fixed",
        450_000,
        "one_time",
        "Tokens, componentes, estados e documentação. Base reutilizável para produto e marca.",
    ),
    (
        "Identidade visual",
        "Design",
        "fixed",
        320_000,
        "one_time",
        "Marca, paleta, tipografia e manual de aplicação.",
    ),
    # ---- Desenvolvimento ----
    (
        "Desenvolvimento frontend",
        "Desenvolvimento",
        "day",
        62_000,
        "one_time",
        "Implementação de interface com testes, acessibilidade e responsividade.",
    ),
    (
        "Desenvolvimento backend",
        "Desenvolvimento",
        "day",
        64_000,
        "one_time",
        "API, modelo de dados, regras de negócio e testes automatizados.",
    ),
    (
        "Integração de sistemas",
        "Desenvolvimento",
        "day",
        70_000,
        "one_time",
        "Ligação a ERP, faturação, pagamentos ou serviços externos, com tratamento de erros e "
        "reconciliação.",
    ),
    (
        "Migração de dados",
        "Desenvolvimento",
        "fixed",
        240_000,
        "one_time",
        "Extração, transformação e carga a partir do sistema antigo, com validação e ensaio antes "
        "do"
        "corte.",
    ),
    (
        "Aplicação móvel",
        "Desenvolvimento",
        "day",
        68_000,
        "one_time",
        "Implementação iOS/Android, incluindo submissão às lojas.",
    ),
    # ---- Infraestrutura ----
    (
        "Configuração de infraestrutura",
        "Infraestrutura",
        "fixed",
        150_000,
        "one_time",
        "Ambientes, CI/CD, observabilidade e cópias de segurança.",
    ),
    (
        "Alojamento gerido",
        "Infraestrutura",
        "month",
        18_000,
        "monthly",
        "Servidor, base de dados, backups diários e monitorização, por ambiente.",
    ),
    (
        "Certificado e domínio",
        "Infraestrutura",
        "license",
        9_000,
        "annual",
        "Registo de domínio e certificado, renovados anualmente.",
    ),
    # ---- Manutenção e suporte ----
    (
        "Avença de manutenção",
        "Manutenção",
        "month",
        85_000,
        "monthly",
        "Correções, atualizações de dependências e pequenas evoluções. Inclui bolsa mensal de "
        "horas.",
    ),
    (
        "Suporte prioritário",
        "Manutenção",
        "month",
        45_000,
        "monthly",
        "Canal dedicado com tempo de resposta acordado em horário útil.",
    ),
    (
        "Bolsa de horas",
        "Manutenção",
        "hour",
        8_500,
        "one_time",
        "Horas pré-compradas para pedidos avulsos, consumidas à medida.",
    ),
    # ---- Formação ----
    (
        "Formação de equipa",
        "Formação",
        "day",
        90_000,
        "one_time",
        "Sessão prática à medida, para a equipa do cliente, com materiais.",
    ),
    (
        "Documentação técnica",
        "Formação",
        "fixed",
        120_000,
        "one_time",
        "Manual de operação e arquitetura, escrito para quem entra de novo.",
    ),
]


def _catalog(db: Session) -> dict[str, CatalogItem]:
    by_name: dict[str, CatalogItem] = {}
    for name, category, unit, price, billing, description in CATALOG:
        item = db.execute(select(CatalogItem).where(CatalogItem.name == name)).scalar_one_or_none()
        if item is None:
            item = CatalogItem(
                name=name,
                description=description,
                category=category,
                unit=unit,
                unit_price=price,
                tax_rate=VAT,
                billing_type=billing,
            )
            db.add(item)
            db.flush()
        by_name[name] = item
    return by_name


# name -> (description, validity days, discount bps, sections, item names)
PROPOSAL_TEMPLATES: list[tuple[str, str, int, int, list[tuple[str, str]], list[str]]] = [
    (
        "Website institucional",
        "Site de apresentação com gestão de conteúdos, para empresas que precisam de presença "
        "sólida sem complexidade.",
        30,
        0,
        [
            (
                "Enquadramento",
                "Esta proposta cobre o desenho e a construção de um website institucional, desde "
                "a descoberta até à entrada em produção.",
            ),
            (
                "Âmbito",
                "Até 8 páginas, gestão de conteúdos, formulário de contacto, otimização para "
                "motores de busca e analítica.",
            ),
            (
                "Prazo",
                "Seis a oito semanas a contar da adjudicação, dependente da entrega de conteúdos "
                "pelo cliente.",
            ),
            (
                "Condições",
                "Pagamento em três marcos: 40% na adjudicação, 30% na aprovação do design, 30% na "
                "entrada em produção.",
            ),
        ],
        [
            "Workshop de descoberta",
            "Design de interface (UI)",
            "Desenvolvimento frontend",
            "Configuração de infraestrutura",
            "Alojamento gerido",
        ],
    ),
    (
        "Aplicação web à medida",
        "Plataforma de raiz com utilizadores, permissões e integrações. Para substituir folhas de "
        "cálculo e processos manuais.",
        30,
        0,
        [
            (
                "Enquadramento",
                "Proposta para desenvolvimento de uma aplicação web à medida do processo de "
                "negócio do cliente.",
            ),
            (
                "Âmbito",
                "Levantamento, desenho, desenvolvimento de frontend e backend, testes "
                "automatizados e colocação em produção.",
            ),
            (
                "Fora de âmbito",
                "Licenças de software de terceiros, conteúdos e migração de dados históricos, "
                "salvo indicação em contrário.",
            ),
            ("Prazo", "Estimativa por fases, revista no final da descoberta."),
            ("Condições", "Faturação por marcos de fase. Prazo de pagamento a 30 dias."),
        ],
        [
            "Workshop de descoberta",
            "Investigação de utilizador (UX)",
            "Design de interface (UI)",
            "Desenvolvimento frontend",
            "Desenvolvimento backend",
            "Configuração de infraestrutura",
            "Documentação técnica",
        ],
    ),
    (
        "Avença de manutenção",
        "Acompanhamento contínuo de um sistema já em produção. Renovação automática, cancelável "
        "com aviso prévio.",
        15,
        0,
        [
            (
                "Enquadramento",
                "Acordo de manutenção e suporte para o sistema em produção do cliente.",
            ),
            (
                "O que inclui",
                "Correção de defeitos, atualizações de segurança e de dependências, monitorização "
                "e pequenas evoluções dentro da bolsa mensal.",
            ),
            (
                "O que não inclui",
                "Novas funcionalidades de dimensão significativa, que são orçamentadas à parte.",
            ),
            ("Vigência", "Contrato de 12 meses, renovável. Denúncia com 60 dias de aviso."),
        ],
        ["Avença de manutenção", "Suporte prioritário", "Alojamento gerido"],
    ),
    (
        "Redesenho de produto",
        "Para produtos que funcionam mas envelheceram. Investigação, novo sistema de design e "
        "implementação faseada.",
        30,
        0,
        [
            (
                "Enquadramento",
                "Redesenho da interface e da experiência de um produto existente, preservando a "
                "operação durante a transição.",
            ),
            (
                "Âmbito",
                "Auditoria, investigação com utilizadores, sistema de design e implementação por "
                "lotes.",
            ),
            (
                "Método",
                "A implementação é faseada para que o produto nunca fique indisponível nem "
                "parcialmente redesenhado.",
            ),
            ("Condições", "Faturação mensal contra horas realizadas, com teto acordado por fase."),
        ],
        [
            "Auditoria técnica",
            "Investigação de utilizador (UX)",
            "Sistema de design",
            "Design de interface (UI)",
            "Desenvolvimento frontend",
        ],
    ),
    (
        "Integração de sistemas",
        "Ligar o que já existe. Para quem tem ERP, loja e faturação a não falarem entre si.",
        30,
        0,
        [
            (
                "Enquadramento",
                "Integração entre os sistemas indicados pelo cliente, com sincronização e "
                "tratamento de erros.",
            ),
            (
                "Âmbito",
                "Mapeamento de dados, desenvolvimento das ligações, reconciliação e painel de "
                "estado.",
            ),
            (
                "Pressupostos",
                "Assume acesso às APIs dos sistemas envolvidos e documentação disponível.",
            ),
            ("Condições", "50% na adjudicação, 50% na aceitação."),
        ],
        [
            "Auditoria técnica",
            "Integração de sistemas",
            "Migração de dados",
            "Documentação técnica",
        ],
    ),
    (
        "Bolsa de horas",
        "Sem projeto fechado. Horas pré-compradas, consumidas conforme a necessidade, com "
        "relatório mensal.",
        15,
        500,
        [
            ("Enquadramento", "Pacote de horas para pedidos avulsos, sem âmbito fechado."),
            (
                "Como funciona",
                "As horas são consumidas por ordem de pedido e reportadas mensalmente. Validade "
                "de 12 meses.",
            ),
            (
                "Condições",
                "Faturação integral na adjudicação. Desconto de 5% face ao preço hora avulso.",
            ),
        ],
        ["Bolsa de horas", "Consultoria técnica"],
    ),
]


def _proposal_templates(db: Session, catalog: dict[str, CatalogItem]) -> int:
    created = 0
    for name, description, validity, discount, sections, item_names in PROPOSAL_TEMPLATES:
        existing = db.execute(
            select(ProposalTemplate).where(ProposalTemplate.name == name)
        ).scalar_one_or_none()
        if existing is not None:
            continue
        tpl = ProposalTemplate(
            name=name,
            description=description,
            default_validity_days=validity,
            default_discount_bps=discount,
            terms="Preços em euros, acrescidos de IVA à taxa legal em vigor.",
        )
        db.add(tpl)
        db.flush()
        for position, (heading, body) in enumerate(sections):
            db.add(
                ProposalTemplateSection(
                    template_id=tpl.id, position=position, heading=heading, body=body
                )
            )
        for position, item_name in enumerate(item_names):
            src = catalog[item_name]
            db.add(
                ProposalTemplateItem(
                    template_id=tpl.id,
                    catalog_item_id=src.id,
                    position=position,
                    name=src.name,
                    unit=src.unit,
                    unit_price=src.unit_price,
                    tax_rate=src.tax_rate,
                    billing_type=src.billing_type,
                    quantity=Decimal("1"),
                )
            )
        created += 1
    return created


# name -> (description, duration days, [(phase, days, [(task, role, hours)])])
PROJECT_TEMPLATES: list[
    tuple[str, str, int, list[tuple[str, int, list[tuple[str, str, float]]]]]
] = [
    (
        "Website institucional",
        "Fluxo padrão para um site de apresentação.",
        50,
        [
            (
                "Descoberta",
                7,
                [
                    ("Workshop com o cliente", "Estratégia", 8),
                    ("Levantamento de conteúdos", "Estratégia", 6),
                    ("Mapa do site", "Design", 4),
                ],
            ),
            (
                "Design",
                14,
                [
                    ("Wireframes", "Design", 12),
                    ("Design de alta fidelidade", "Design", 24),
                    ("Aprovação do cliente", "Design", 4),
                ],
            ),
            (
                "Desenvolvimento",
                21,
                [
                    ("Estrutura e componentes", "Desenvolvimento", 30),
                    ("Integração de conteúdos", "Desenvolvimento", 16),
                    ("SEO e analítica", "Desenvolvimento", 8),
                ],
            ),
            (
                "Entrega",
                8,
                [
                    ("Testes e correções", "Qualidade", 12),
                    ("Colocação em produção", "Infraestrutura", 6),
                    ("Formação de gestão de conteúdos", "Estratégia", 4),
                ],
            ),
        ],
    ),
    (
        "Aplicação web à medida",
        "Projeto completo, da descoberta à produção.",
        120,
        [
            (
                "Descoberta",
                14,
                [
                    ("Entrevistas com utilizadores", "Estratégia", 16),
                    ("Modelo de domínio", "Desenvolvimento", 12),
                    ("Âmbito e estimativa", "Estratégia", 8),
                ],
            ),
            (
                "Design",
                21,
                [
                    ("Fluxos principais", "Design", 20),
                    ("Sistema de design", "Design", 32),
                    ("Protótipo navegável", "Design", 16),
                ],
            ),
            (
                "Construção",
                60,
                [
                    ("Autenticação e permissões", "Desenvolvimento", 40),
                    ("Módulos principais", "Desenvolvimento", 120),
                    ("Integrações", "Desenvolvimento", 40),
                    ("Testes automatizados", "Qualidade", 32),
                ],
            ),
            (
                "Estabilização",
                15,
                [
                    ("Testes de aceitação", "Qualidade", 24),
                    ("Correções", "Desenvolvimento", 24),
                    ("Documentação", "Desenvolvimento", 12),
                ],
            ),
            (
                "Lançamento",
                10,
                [
                    ("Migração de dados", "Desenvolvimento", 16),
                    ("Entrada em produção", "Infraestrutura", 8),
                    ("Acompanhamento pós-lançamento", "Desenvolvimento", 16),
                ],
            ),
        ],
    ),
    (
        "Redesenho de produto",
        "Renovar um produto em produção sem o parar.",
        90,
        [
            (
                "Auditoria",
                10,
                [
                    ("Inventário de ecrãs", "Design", 12),
                    ("Avaliação de acessibilidade", "Design", 8),
                    ("Dívida técnica do frontend", "Desenvolvimento", 10),
                ],
            ),
            (
                "Direção",
                14,
                [
                    ("Exploração visual", "Design", 20),
                    ("Escolha de direção com o cliente", "Design", 4),
                    ("Sistema de design", "Design", 32),
                ],
            ),
            (
                "Aplicação",
                45,
                [
                    ("Shell e navegação", "Desenvolvimento", 24),
                    ("Ecrãs principais", "Desenvolvimento", 60),
                    ("Ecrãs secundários", "Desenvolvimento", 40),
                ],
            ),
            (
                "Verificação",
                12,
                [
                    ("Regressão visual", "Qualidade", 16),
                    ("Testes com utilizadores", "Design", 12),
                ],
            ),
        ],
    ),
    (
        "Integração de sistemas",
        "Ligar sistemas existentes com reconciliação.",
        45,
        [
            (
                "Levantamento",
                10,
                [
                    ("Mapeamento de dados", "Desenvolvimento", 16),
                    ("Acesso e credenciais", "Infraestrutura", 4),
                ],
            ),
            (
                "Construção",
                22,
                [
                    ("Ligações e sincronização", "Desenvolvimento", 48),
                    ("Tratamento de erros", "Desenvolvimento", 16),
                    ("Painel de estado", "Desenvolvimento", 12),
                ],
            ),
            (
                "Validação",
                13,
                [
                    ("Reconciliação em ambiente de ensaio", "Qualidade", 16),
                    ("Corte para produção", "Infraestrutura", 8),
                ],
            ),
        ],
    ),
    (
        "Manutenção mensal",
        "Ciclo recorrente de uma avença.",
        30,
        [
            (
                "Rotina",
                30,
                [
                    ("Atualização de dependências", "Desenvolvimento", 6),
                    ("Revisão de monitorização", "Infraestrutura", 3),
                    ("Correções do mês", "Desenvolvimento", 16),
                    ("Relatório ao cliente", "Estratégia", 2),
                ],
            ),
        ],
    ),
]


def _project_templates(db: Session) -> int:
    created = 0
    for name, description, duration, phases in PROJECT_TEMPLATES:
        existing = db.execute(
            select(ProjectTemplate).where(ProjectTemplate.name == name)
        ).scalar_one_or_none()
        if existing is not None:
            continue
        tpl = ProjectTemplate(name=name, description=description, expected_duration=duration)
        db.add(tpl)
        db.flush()
        for order, (phase_name, phase_days, tasks) in enumerate(phases):
            phase = TemplatePhase(
                template_id=tpl.id,
                name=phase_name,
                order_index=order,
                expected_duration=phase_days,
            )
            db.add(phase)
            db.flush()
            for t_order, (title, role, hours) in enumerate(tasks):
                db.add(
                    TemplateTask(
                        template_phase_id=phase.id,
                        title=title,
                        order_index=t_order,
                        role_responsible=role,
                        estimate_hours=Decimal(str(hours)),
                    )
                )
        created += 1
    return created


def seed_catalog_and_templates(db: Session) -> dict[str, int]:
    """Insert the catalogue and both template families. Safe to re-run."""
    catalog = _catalog(db)
    proposals = _proposal_templates(db, catalog)
    projects = _project_templates(db)
    db.commit()
    return {
        "catalog_items": len(catalog),
        "proposal_templates": proposals,
        "project_templates": projects,
    }
