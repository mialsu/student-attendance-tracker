"""add registration code expiry

Revision ID: d9a611615af9
Revises: 1508be2efe8c
Create Date: 2026-09-01 18:10:13.286355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9a611615af9'
down_revision: Union[str, None] = '1508be2efe8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Added nullable, backfilled, then made mandatory: every existing row must carry a value
    # before the NOT NULL lands, and no row is deleted to get there.
    op.add_column(
        'registration_codes',
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Every code that exists today lands ALREADY EXPIRED: created_at is in the past by far more
    # than a day, so created_at + 24h is too. That is the point — the old codes were valid
    # forever, and this is the change that ends that.
    op.execute(
        "UPDATE registration_codes "
        "SET expires_at = created_at + INTERVAL '24 hours' "
        "WHERE expires_at IS NULL"
    )

    op.alter_column('registration_codes', 'expires_at', nullable=False)


def downgrade() -> None:
    op.drop_column('registration_codes', 'expires_at')
