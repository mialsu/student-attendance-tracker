"""drop user role

Revision ID: 48f396b77446
Revises: 7c081032bae3
Create Date: 2026-09-01 23:41:07.512884

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48f396b77446'
down_revision: Union[str, None] = '7c081032bae3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADR-0003. The role's entire power was three /api/admin/codes endpoints; those are gone, and
    # issuing a code is now authorized by database access. Nothing else in the system ever read
    # this column — no ownership check made a role exception, and it was never in the access
    # token — so dropping it changes no behaviour. A column no code reads is drift with a delay
    # timer, which is why it goes rather than staying unused.
    op.drop_column('users', 'role')


def downgrade() -> None:
    # Comes back as it was: NOT NULL with the same default, so every existing user lands a
    # teacher. That is not a guess — a user who was a superadmin was one in order to press a
    # button that no longer exists, and re-granting it would restore a permission over a surface
    # that is gone.
    op.add_column(
        'users',
        sa.Column('role', sa.String(length=20), nullable=False, server_default='teacher'),
    )
    op.alter_column('users', 'role', server_default=None)
