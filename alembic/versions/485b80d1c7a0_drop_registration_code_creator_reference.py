"""drop registration code creator reference

Revision ID: 485b80d1c7a0
Revises: d9a611615af9
Create Date: 2026-09-01 21:31:38.330051

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '485b80d1c7a0'
down_revision: Union[str, None] = 'd9a611615af9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dropped, not nulled (ADR-0003). Codes are issued from the command line now, so every code
    # from here on has no creator, and a column empty for every new row is drift with a delay
    # timer. This also disposes of an ON DELETE CASCADE that would have deleted every code a
    # removed user had issued, redeemed ones included.
    #
    # Existing rows lose the record of who created them. With one operator and a handful of
    # codes, that record read "the Owner, via the dashboard" in every case.
    # Dropping the column takes its foreign key with it, so the constraint is not named here.
    # Its name comes from the metadata naming convention (app/database.py:37) and differs from
    # PostgreSQL's default, which is the kind of detail a hand-written migration gets wrong.
    op.drop_column('registration_codes', 'created_by_user_id')


def downgrade() -> None:
    # Irreversible in substance: who created each code is gone. The column comes back nullable
    # so the downgrade can run at all — the original NOT NULL cannot be restored without
    # inventing a creator for every row, which is the false record ADR-0003 refused.
    op.add_column(
        'registration_codes',
        sa.Column('created_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_registration_codes_created_by_user_id_users',
        'registration_codes',
        'users',
        ['created_by_user_id'],
        ['id'],
        ondelete='CASCADE',
    )
