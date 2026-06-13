"""add google auth fields, role and approval status

Revision ID: b2f1a9c4d7e3
Revises: 7631a5cf7d60
Create Date: 2026-06-07 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2f1a9c4d7e3'
down_revision: Union[str, None] = '7631a5cf7d60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('google_sub', sa.String(), nullable=True))
    op.add_column('users', sa.Column('picture', sa.String(), nullable=True))
    op.add_column('users', sa.Column('role', sa.String(), nullable=False, server_default='user'))
    op.add_column('users', sa.Column('status', sa.String(), nullable=False, server_default='pending'))
    op.create_index(op.f('ix_users_google_sub'), 'users', ['google_sub'], unique=True)

    # Google users have no local password.
    op.alter_column('users', 'hashed_password', existing_type=sa.String(), nullable=True)

    # Existing accounts predate the approval system — grant them access.
    op.execute("UPDATE users SET status = 'approved'")


def downgrade() -> None:
    op.alter_column('users', 'hashed_password', existing_type=sa.String(), nullable=False)
    op.drop_index(op.f('ix_users_google_sub'), table_name='users')
    op.drop_column('users', 'status')
    op.drop_column('users', 'role')
    op.drop_column('users', 'picture')
    op.drop_column('users', 'google_sub')
