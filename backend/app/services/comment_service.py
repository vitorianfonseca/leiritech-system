"""Comment & @mention business logic (F16).

The ONE place comments are created, edited and deleted. Every path is gated by
**parent visibility** (BR-002): a caller may read or post comments on an entity
only if they may see that entity. We reuse the exact same gate the attachments
API uses — ``attachment_service.authorize_entity_access`` — so a comment inherits
its parent record's visibility and a Membro can never read or post into a record
they are not scoped to (out-of-scope → 404, enumeration-safe).

@mentions fan out through ``notification_service.create_notification``. A mention
only notifies a user who can themselves see the parent entity: we never notify a
user *into* a record they cannot access (that would leak its existence). Such
mentions are still persisted (so the author sees who they tagged) but skipped for
notification.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy.orm import Session

from app.core import errors, permissions
from app.models.collaboration import Comment
from app.models.user import User
from app.repositories import comments as comment_repo
from app.schemas.comments import (
    CommentCreateRequest,
    CommentResponse,
    CommentUpdateRequest,
    DirectoryUser,
)
from app.services import attachment_service, notification_service

logger = structlog.get_logger("aurea.comment")


# --------------------------------------------------------------------------- #
# Serialization helpers
# --------------------------------------------------------------------------- #
def _author_dto(author_id: uuid.UUID | None, users: dict[uuid.UUID, User]) -> DirectoryUser:
    """Build the required ``author`` shape. A comment whose author was deleted
    (author_id SET NULL, BR) still renders with a stable placeholder so the
    frontend never receives a null author."""
    user = users.get(author_id) if author_id else None
    if user is None:
        return DirectoryUser(
            id=author_id or uuid.UUID(int=0),
            name="Utilizador removido",
            email="",
            avatar_url=None,
        )
    return DirectoryUser(
        id=user.id, name=user.name, email=user.email, avatar_url=user.avatar_url
    )


def _to_response(
    comment: Comment,
    users: dict[uuid.UUID, User],
    mention_ids: list[uuid.UUID],
) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        author=_author_dto(comment.author_id, users),
        body=comment.body,
        mentions=mention_ids,
        # Comments do not own file bytes in this backend — the attachments API
        # (#46) handles storage. Kept as an (always empty) list for the contract.
        attachments=[],
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


# --------------------------------------------------------------------------- #
# Mention handling
# --------------------------------------------------------------------------- #
def _persist_and_notify_mentions(
    db: Session,
    *,
    comment: Comment,
    author: User,
    requested_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Persist the comment's mentions (valid, existing users only) and notify each
    mentioned user who can see the parent entity. Returns the persisted ids.

    A mentioned user who cannot see the parent is still recorded but NOT notified
    — we never notify someone into a record they cannot access (BR-002)."""
    # Drop unknown / non-existent user ids (FK safety) and self-mentions of nobody.
    known = comment_repo.users_by_ids(db, requested_ids)
    valid_ids = [uid for uid in dict.fromkeys(requested_ids) if uid in known]

    persisted = comment_repo.replace_mentions(db, comment.id, valid_ids)

    for user_id in persisted:
        if user_id == author.id:
            continue  # don't notify a user about their own mention
        mentioned = known[user_id]
        if not _can_see_parent(db, mentioned, comment.entity_type, comment.entity_id):
            logger.info(
                "mention_notification_skipped_out_of_scope",
                comment_id=str(comment.id),
                mentioned_user_id=str(user_id),
            )
            continue
        notification_service.create_notification(
            db,
            user_id=user_id,
            type="mention",
            body=f"{author.name} mencionou-o num comentário.",
            entity_type=comment.entity_type,
            entity_id=comment.entity_id,
        )
    return persisted


def _can_see_parent(
    db: Session, user: User, entity_type: str, entity_id: uuid.UUID
) -> bool:
    try:
        attachment_service.authorize_entity_access(db, user, entity_type, entity_id)
        return True
    except errors.ApiError:
        return False


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def list_comments(
    db: Session, user: User, entity_type: str, entity_id: uuid.UUID
) -> list[CommentResponse]:
    """Comments on an entity, oldest first. 404 if the caller may not see the
    parent (enumeration-safe)."""
    attachment_service.authorize_entity_access(db, user, entity_type, entity_id)

    rows = comment_repo.list_for_entity(db, entity_type, entity_id)
    mentions = comment_repo.mentions_for_comments(db, [c.id for c in rows])
    author_ids = {c.author_id for c in rows if c.author_id}
    users = comment_repo.users_by_ids(db, author_ids)
    return [_to_response(c, users, mentions.get(c.id, [])) for c in rows]


def create_comment(
    db: Session, user: User, payload: CommentCreateRequest
) -> CommentResponse:
    """Create a comment on an entity the caller can see, persist its @mentions and
    notify the mentioned users. 404 if the caller may not see the parent."""
    attachment_service.authorize_entity_access(
        db, user, payload.entity_type, payload.entity_id
    )

    comment = Comment(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        author_id=user.id,
        body=payload.body,
        created_by=user.id,
    )
    db.add(comment)
    db.flush()

    persisted = _persist_and_notify_mentions(
        db, comment=comment, author=user, requested_ids=payload.mentions
    )
    db.commit()
    db.refresh(comment)

    logger.info(
        "comment_created",
        comment_id=str(comment.id),
        entity_type=comment.entity_type,
        entity_id=str(comment.entity_id),
        author_id=str(user.id),
        mentions=len(persisted),
    )
    users = {user.id: user}
    return _to_response(comment, users, persisted)


def update_comment(
    db: Session, user: User, comment_id: uuid.UUID, payload: CommentUpdateRequest
) -> CommentResponse:
    """Edit a comment. Author only — a caller who can see the parent but is not the
    author gets 403; a caller who cannot see the parent gets 404 (no existence
    leak)."""
    comment = comment_repo.get(db, comment_id)
    if comment is None:
        raise errors.not_found("Comentário não encontrado.", code="COMMENT_NOT_FOUND")
    # Out-of-scope callers cannot even confirm the comment exists.
    attachment_service.authorize_entity_access(
        db, user, comment.entity_type, comment.entity_id
    )
    if comment.author_id != user.id:
        raise errors.forbidden(
            "Só o autor pode editar este comentário.", code="COMMENT_NOT_AUTHOR"
        )

    comment.body = payload.body
    comment.edited_at = datetime.now(tz=UTC)
    db.flush()

    persisted = _persist_and_notify_mentions(
        db, comment=comment, author=user, requested_ids=payload.mentions
    )
    db.commit()
    db.refresh(comment)

    logger.info(
        "comment_updated",
        comment_id=str(comment.id),
        author_id=str(user.id),
        mentions=len(persisted),
    )
    users = {user.id: user}
    return _to_response(comment, users, persisted)


def delete_comment(db: Session, user: User, comment_id: uuid.UUID) -> None:
    """Delete a comment. Author or Admin only. Mentions cascade with the row."""
    comment = comment_repo.get(db, comment_id)
    if comment is None:
        raise errors.not_found("Comentário não encontrado.", code="COMMENT_NOT_FOUND")
    attachment_service.authorize_entity_access(
        db, user, comment.entity_type, comment.entity_id
    )
    if comment.author_id != user.id and not permissions.is_admin(user):
        raise errors.forbidden(
            "Só o autor ou um Administrador pode remover este comentário.",
            code="COMMENT_NOT_AUTHOR",
        )

    db.delete(comment)
    db.commit()
    logger.info(
        "comment_deleted", comment_id=str(comment_id), actor_id=str(user.id)
    )
