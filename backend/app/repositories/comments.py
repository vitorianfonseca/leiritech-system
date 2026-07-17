"""Comment / mention data-access layer (F16).

SQLAlchemy 2.0 (sync ``Session``) reads and writes backing the comment threads
that embed on companies, opportunities, proposals, projects and tasks. Parent
visibility (BR-002) is enforced one layer up, in ``comment_service`` — this
module only moves rows.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.collaboration import Comment, Mention
from app.models.user import User


def list_for_entity(
    db: Session, entity_type: str, entity_id: uuid.UUID
) -> list[Comment]:
    """Comments on one entity, oldest first (a thread reads top to bottom)."""
    return list(
        db.execute(
            select(Comment)
            .where(
                Comment.entity_type == entity_type,
                Comment.entity_id == entity_id,
            )
            .order_by(Comment.created_at.asc())
        ).scalars()
    )


def get(db: Session, comment_id: uuid.UUID) -> Comment | None:
    return db.get(Comment, comment_id)


def mentions_for_comments(
    db: Session, comment_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Map each comment id to the list of user ids mentioned in it (one query)."""
    result: dict[uuid.UUID, list[uuid.UUID]] = {cid: [] for cid in comment_ids}
    if not comment_ids:
        return result
    rows = db.execute(
        select(Mention.comment_id, Mention.mentioned_user_id).where(
            Mention.comment_id.in_(comment_ids)
        )
    ).all()
    for comment_id, user_id in rows:
        result.setdefault(comment_id, []).append(user_id)
    return result


def users_by_ids(
    db: Session, user_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, User]:
    ids = [uid for uid in set(user_ids) if uid is not None]
    if not ids:
        return {}
    rows = db.execute(select(User).where(User.id.in_(ids))).scalars()
    return {u.id: u for u in rows}


def replace_mentions(
    db: Session, comment_id: uuid.UUID, user_ids: Iterable[uuid.UUID]
) -> list[uuid.UUID]:
    """Set a comment's mentions to exactly ``user_ids`` (deduped). Returns the
    persisted set. Does NOT commit — the service owns the transaction."""
    db.execute(delete(Mention).where(Mention.comment_id == comment_id))
    unique = list(dict.fromkeys(uid for uid in user_ids if uid is not None))
    for user_id in unique:
        db.add(Mention(comment_id=comment_id, mentioned_user_id=user_id))
    db.flush()
    return unique
