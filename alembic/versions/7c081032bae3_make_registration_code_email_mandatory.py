"""make registration code email mandatory

Revision ID: 7c081032bae3
Revises: 485b80d1c7a0
Create Date: 2026-09-01 23:05:12.884401

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c081032bae3'
down_revision: Union[str, None] = '485b80d1c7a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # INV-7: a code names the one address that may redeem it. Until now the column was nullable
    # and NULL meant *anybody* — the footgun this migration exists to remove.
    #
    # Legacy rows are REVOKED, not deleted (the two earlier migrations on this column both
    # deleted them, and that throws away who redeemed what). They are also given '' rather than
    # an invented address: no signup can present an empty address, so the row matches nobody,
    # and `validate_registration_code` refuses it on the revoked branch before it ever gets to
    # the comparison. Two locks, no fiction.
    op.execute(
        "UPDATE registration_codes "
        "SET revoked = true, email_restriction = '' "
        "WHERE email_restriction IS NULL"
    )

    op.alter_column(
        'registration_codes',
        'email_restriction',
        existing_type=sa.String(length=255),
        nullable=False,
    )


def downgrade() -> None:
    # Only the constraint comes off. The revocations stay: a code the upgrade revoked was a
    # universal code, and handing those back live is the state this change was written to end.
    # Restoring NULL would also be a guess — '' and NULL are indistinguishable after the fact.
    op.alter_column(
        'registration_codes',
        'email_restriction',
        existing_type=sa.String(length=255),
        nullable=True,
    )
