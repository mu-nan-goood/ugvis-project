"""add_user_id_to_feedback

Revision ID: ccee3fe45730
Revises: 
Create Date: 2026-05-19 23:12:33.424966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ccee3fe45730'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('advice_feedback', sa.Column('user_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_advice_feedback_user_id'), 'advice_feedback', ['user_id'], unique=False)
    # Note: SQLite doesn't support ALTER CONSTRAINT; FK enforced at ORM level


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_advice_feedback_user_id'), table_name='advice_feedback')
    op.drop_column('advice_feedback', 'user_id')
