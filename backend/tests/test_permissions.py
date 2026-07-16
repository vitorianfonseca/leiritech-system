"""Unit tests for the authoritative permission predicates (WORKFLOW_SPEC §3)."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.api.dependencies import auth as auth_deps
from app.core import permissions
from app.core.errors import ApiError
from app.core.permissions import Role


@dataclass
class FakeUser:
    role: str
    status: str = "active"
    payments_grant: bool = False
    invites_grant: bool = False


ADMIN = FakeUser(Role.ADMIN)
GESTOR = FakeUser(Role.GESTOR)
GESTOR_PAY = FakeUser(Role.GESTOR, payments_grant=True)
GESTOR_INV = FakeUser(Role.GESTOR, invites_grant=True)
MEMBRO = FakeUser(Role.MEMBRO)


# --- Financials (BR-008) --------------------------------------------------- #
def test_financials_admin_always():
    assert permissions.can_manage_financials(ADMIN) is True


def test_financials_gestor_requires_grant():
    assert permissions.can_manage_financials(GESTOR) is False
    assert permissions.can_manage_financials(GESTOR_PAY) is True


def test_financials_membro_never():
    assert permissions.can_manage_financials(MEMBRO) is False


# --- Invites (BR-003) ------------------------------------------------------ #
def test_invites_gestor_requires_grant():
    assert permissions.can_manage_invitations(GESTOR) is False
    assert permissions.can_manage_invitations(GESTOR_INV) is True
    assert permissions.can_manage_invitations(ADMIN) is True
    assert permissions.can_manage_invitations(MEMBRO) is False


# --- User management (BR-004/005) ------------------------------------------ #
def test_manage_users_admin_only():
    assert permissions.can_manage_users(ADMIN) is True
    assert permissions.can_manage_users(GESTOR) is False
    assert permissions.can_manage_users(MEMBRO) is False


# --- Project view scoping (BR-002) ----------------------------------------- #
def test_view_project_gestor_sees_all():
    assert permissions.can_view_project(GESTOR, is_member=False) is True


def test_view_project_membro_only_member_or_owner():
    assert permissions.can_view_project(MEMBRO, is_member=True) is True
    assert permissions.can_view_project(MEMBRO, is_member=False, is_owner=True) is True
    assert permissions.can_view_project(MEMBRO, is_member=False) is False


# --- Task edit (H7) -------------------------------------------------------- #
def test_edit_task_membro_only_on_member_project():
    assert permissions.can_edit_task(MEMBRO, is_member=True) is True
    assert permissions.can_edit_task(MEMBRO, is_member=False) is False
    assert permissions.can_edit_task(ADMIN, is_member=False) is True


# --- Task approval (C3) ---------------------------------------------------- #
def test_approve_task_membro_never():
    assert permissions.can_approve_task(MEMBRO) is False
    assert permissions.can_approve_task(ADMIN) is True
    assert permissions.can_approve_task(GESTOR, is_project_manager=True) is True
    assert permissions.can_approve_task(GESTOR, is_project_manager=False) is False


# --- BR-002 404 boundary --------------------------------------------------- #
def test_scoped_or_404_blocks_non_member_membro():
    with pytest.raises(ApiError) as exc:
        auth_deps.scoped_or_404(MEMBRO, is_member=False)
    assert exc.value.status_code == 404


def test_scoped_or_404_allows_member():
    # Should not raise.
    auth_deps.scoped_or_404(MEMBRO, is_member=True)
    auth_deps.scoped_or_404(GESTOR, is_member=False)
