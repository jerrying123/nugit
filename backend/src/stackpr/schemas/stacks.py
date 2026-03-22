"""Stack and PR request/response schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class StackCreate(BaseModel):
    repo_full_name: str
    created_by: str


class StackedPRRead(BaseModel):
    id: str
    pr_number: int
    position: int
    head_branch: str
    base_branch: str
    head_sha: str
    base_sha: str
    status: str
    has_unabsorbed_changes: bool
    author_github_login: Optional[str] = None
    is_fork: bool = False

    model_config = {"from_attributes": True}


class StackRead(BaseModel):
    id: str
    repo_full_name: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    prs: list[StackedPRRead]

    model_config = {"from_attributes": True}


class ReorderPRsBody(BaseModel):
    pr_numbers: list[int]  # new order (by pr_number)


class InsertPRBody(BaseModel):
    position: int
    pr_number: int
    head_branch: str
    base_branch: str
    head_sha: str
    base_sha: str
    author_github_login: Optional[str] = None
    is_fork: bool = False
    head_repo_full_name: Optional[str] = None
    base_repo_full_name: Optional[str] = None


class ResolutionContextBody(BaseModel):
    user_github_login: str
    resolution_pr_number: int
