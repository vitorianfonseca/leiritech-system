"""Product/service catalog — reusable priced master data for proposals.

Money is integer EUR cents; ``tax_rate`` is a percentage (Numeric(5,2)). Items
are soft-deletable (``ArchiveMixin``) so archiving one never breaks a proposal
that snapshotted its price. Enum values are stable English keys; pt-PT labels
render client-side.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import BigInteger, Enum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import ArchiveMixin, AuditBase
from app.models import enums


class CatalogItem(AuditBase, ArchiveMixin):
    __tablename__ = "catalog_items"
    __table_args__ = (
        Index(
            "ix_catalog_items_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    unit: Mapped[str] = mapped_column(
        Enum(*enums.CATALOG_UNITS, name="catalog_unit", native_enum=False),
        nullable=False,
        default="unit",
    )
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)  # EUR cents
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("23.00")
    )
    billing_type: Mapped[str] = mapped_column(
        Enum(*enums.BILLING_TYPES, name="billing_type", native_enum=False),
        nullable=False,
        default="one_time",
    )
