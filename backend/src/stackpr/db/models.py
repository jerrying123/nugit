"""SQLAlchemy models for StackPR."""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Stack(Base):
    __tablename__ = "stacks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    repo_full_name: Mapped[str] = mapped_column(String(256), index=True)
    created_by: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    prs: Mapped[list["StackedPr"]] = relationship(
        "StackedPr", back_populates="stack", order_by="StackedPr.position"
    )
    resolution_contexts: Mapped[list["StackResolutionContext"]] = relationship(
        "StackResolutionContext", back_populates="stack", cascade="all, delete-orphan"
    )


class StackedPr(Base):
    __tablename__ = "stacked_prs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    stack_id: Mapped[str] = mapped_column(String(32), ForeignKey("stacks.id", ondelete="CASCADE"))
    pr_number: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)
    head_branch: Mapped[str] = mapped_column(String(256))
    base_branch: Mapped[str] = mapped_column(String(256))
    head_sha: Mapped[str] = mapped_column(String(40))
    base_sha: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(32), default="open")  # open | merged | closed
    has_unabsorbed_changes: Mapped[bool] = mapped_column(Boolean, default=False)
    author_github_login: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    is_fork: Mapped[bool] = mapped_column(Boolean, default=False)
    head_repo_full_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    base_repo_full_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    stack: Mapped["Stack"] = relationship("Stack", back_populates="prs")

    __table_args__ = (
        UniqueConstraint("stack_id", "pr_number", name="uq_stack_pr"),
        UniqueConstraint("stack_id", "position", name="uq_stack_position"),
    )


class ReconciliationJob(Base):
    __tablename__ = "reconciliation_jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    stack_id: Mapped[str] = mapped_column(String(32), ForeignKey("stacks.id", ondelete="CASCADE"))
    source_pr_number: Mapped[int] = mapped_column(Integer)
    target_pr_number: Mapped[int] = mapped_column(Integer)
    diff_patch: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strategy: Mapped[str] = mapped_column(String(32))  # absorb-to-tip | cascade
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class UserToken(Base):
    """Per-user GitHub token for repo operations (OAuth/PAT)."""

    __tablename__ = "user_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_github_id: Mapped[int] = mapped_column(Integer, unique=True)
    user_github_login: Mapped[str] = mapped_column(String(256), index=True)
    token_encrypted: Mapped[str] = mapped_column(Text)  # store encrypted; decrypt at use
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class StackResolutionContext(Base):
    """Per-user resolution context: which PR they are 'fixing' when working at tip."""

    __tablename__ = "stack_resolution_contexts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    stack_id: Mapped[str] = mapped_column(String(32), ForeignKey("stacks.id", ondelete="CASCADE"))
    user_github_login: Mapped[str] = mapped_column(String(256), index=True)
    resolution_pr_number: Mapped[int] = mapped_column(Integer)  # PR being fixed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    stack: Mapped["Stack"] = relationship("Stack", back_populates="resolution_contexts")

    __table_args__ = (UniqueConstraint("stack_id", "user_github_login", name="uq_stack_user_resolution"),)
