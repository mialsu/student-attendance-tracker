"""make_email_restriction_optional

Revision ID: 6f5cb7d23959
Revises: 01edea317e5e
Create Date: 2026-02-28 13:14:07.421861

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f5cb7d23959'
down_revision: Union[str, None] = '01edea317e5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop unique constraint on email_restriction
    op.drop_index('ix_registration_codes_email_restriction',
                  table_name='registration_codes')

    # Make email_restriction nullable
    op.alter_column('registration_codes', 'email_restriction',
                   existing_type=sa.VARCHAR(length=255),
                   nullable=True)

    # Re-create index without unique constraint
    op.create_index(op.f('ix_registration_codes_email_restriction'),
                    'registration_codes',
                    ['email_restriction'],
                    unique=False)


def downgrade() -> None:
    # Delete codes with NULL email_restriction
    op.execute("DELETE FROM registration_codes WHERE email_restriction IS NULL")

    # Make email_restriction NOT NULL
    op.alter_column('registration_codes', 'email_restriction',
                   existing_type=sa.VARCHAR(length=255),
                   nullable=False)

    # Re-create unique index
    op.drop_index(op.f('ix_registration_codes_email_restriction'),
                  table_name='registration_codes')
    op.create_index(op.f('ix_registration_codes_email_restriction'),
                    'registration_codes',
                    ['email_restriction'],
                    unique=True)
