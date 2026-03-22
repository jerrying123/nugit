"""Initial schema: stacks, stacked_prs, reconciliation_jobs, user_tokens, stack_resolution_contexts.

Revision ID: 001
Revises:
Create Date: 2025-03-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stacks",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("repo_full_name", sa.String(256), nullable=False, index=True),
        sa.Column("created_by", sa.String(256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "stacked_prs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("stack_id", sa.String(32), sa.ForeignKey("stacks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pr_number", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("head_branch", sa.String(256), nullable=False),
        sa.Column("base_branch", sa.String(256), nullable=False),
        sa.Column("head_sha", sa.String(40), nullable=False),
        sa.Column("base_sha", sa.String(40), nullable=False),
        sa.Column("status", sa.String(32), server_default="open"),
        sa.Column("has_unabsorbed_changes", sa.Boolean(), server_default="false"),
        sa.Column("author_github_login", sa.String(256), nullable=True),
        sa.Column("is_fork", sa.Boolean(), server_default="false"),
        sa.Column("head_repo_full_name", sa.String(256), nullable=True),
        sa.Column("base_repo_full_name", sa.String(256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("stack_id", "pr_number", name="uq_stack_pr"),
        sa.UniqueConstraint("stack_id", "position", name="uq_stack_position"),
    )
    op.create_table(
        "reconciliation_jobs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("stack_id", sa.String(32), sa.ForeignKey("stacks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_pr_number", sa.Integer(), nullable=False),
        sa.Column("target_pr_number", sa.Integer(), nullable=False),
        sa.Column("diff_patch", sa.Text(), nullable=True),
        sa.Column("strategy", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "user_tokens",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_github_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("user_github_login", sa.String(256), nullable=False, index=True),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "stack_resolution_contexts",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("stack_id", sa.String(32), sa.ForeignKey("stacks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_github_login", sa.String(256), nullable=False, index=True),
        sa.Column("resolution_pr_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("stack_id", "user_github_login", name="uq_stack_user_resolution"),
    )


def downgrade() -> None:
    op.drop_table("stack_resolution_contexts")
    op.drop_table("user_tokens")
    op.drop_table("reconciliation_jobs")
    op.drop_table("stacked_prs")
    op.drop_table("stacks")
