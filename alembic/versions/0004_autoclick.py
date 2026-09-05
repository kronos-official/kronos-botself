"""add autoclick settings

Revision ID: 0004_autoclick
Revises: 0003_support_center
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_autoclick"
down_revision = "0003_support_center"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "autoclick_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "account_id",
            sa.Integer(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("group_peer_id", sa.BigInteger(), nullable=True),
        sa.Column("group_title", sa.String(length=255), nullable=True),
        sa.Column("group_username", sa.String(length=255), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "selected_action",
            sa.String(length=64),
            nullable=False,
            server_default="فروش ماهی",
        ),
        sa.Column(
            "bot_username",
            sa.String(length=255),
            nullable=False,
            server_default="MeowieQBot",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_autoclick_settings_group_peer_id",
        "autoclick_settings",
        ["group_peer_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_autoclick_settings_group_peer_id",
        table_name="autoclick_settings",
    )
    op.drop_table("autoclick_settings")
