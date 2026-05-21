"""add_ondelete_set_null_feedback_user_id

Revision ID: 2fa523fe893a
Revises: ccee3fe45730
Create Date: 2026-05-21 13:57:42.605869

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2fa523fe893a'
down_revision: Union[str, Sequence[str], None] = 'ccee3fe45730'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add ON DELETE SET NULL to advice_feedback.user_id FK."""
    # SQLite batch 模式：原表无显式 FK 约束，直接添加
    with op.batch_alter_table('advice_feedback', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_advice_feedback_user_id_users',
            'users', ['user_id'], ['id'], ondelete='SET NULL',
        )


def downgrade() -> None:
    """Downgrade schema: remove FK constraint."""
    with op.batch_alter_table('advice_feedback', schema=None) as batch_op:
        batch_op.drop_constraint('fk_advice_feedback_user_id_users', type_='foreignkey')
