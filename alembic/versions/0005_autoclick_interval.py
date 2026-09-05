"""add autoclick interval

Revision ID: 0005_autoclick_interval
Revises: 0004_autoclick
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_autoclick_interval"
down_revision = "0004_autoclick"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "autoclick_settings",
        sa.Column(
            "interval_seconds",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )


def downgrade() -> None:
    op.drop_column("autoclick_settings", "interval_seconds")
