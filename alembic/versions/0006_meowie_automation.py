from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_meowie_automation"
down_revision = "0005_autoclick_interval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meowie_automation_settings",
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("group_peer_id", sa.BigInteger(), nullable=True),
        sa.Column("group_title", sa.String(length=255), nullable=True),
        sa.Column("group_username", sa.String(length=255), nullable=True),
        sa.Column("meow_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("meow_retry_seconds", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("cat_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cat_collect_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cat_collect_interval_seconds", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("cat_upgrade_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cat_upgrade_retry_seconds", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("factory_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("factory_storage_upgrade", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("factory_workers_upgrade", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("factory_machines_upgrade", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("factory_products", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("account_id"),
    )
    op.create_index("ix_meowie_automation_enabled_group", "meowie_automation_settings", ["enabled", "group_peer_id"])


def downgrade() -> None:
    op.drop_index("ix_meowie_automation_enabled_group", table_name="meowie_automation_settings")
    op.drop_table("meowie_automation_settings")
