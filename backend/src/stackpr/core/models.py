"""Domain models for core stack logic (no DB dependency)."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

StackId = str
PRNumber = int


@dataclass
class ReconciliationRecord:
    source_pr_number: PRNumber
    diff_patch: str
    created_at: datetime
    strategy: str  # "absorb-to-tip" | "cascade"


@dataclass
class StackedPR:
    pr_number: PRNumber
    position: int
    head_branch: str
    base_branch: str
    head_sha: str
    base_sha: str
    status: str  # "open" | "merged" | "closed"
    has_unabsorbed_changes: bool = False
    pending_reconciliation: Optional[ReconciliationRecord] = None

    def __hash__(self) -> int:
        return hash((self.pr_number, self.position))


@dataclass
class Stack:
    id: StackId
    repo_full_name: str
    created_by: str
    prs: list[StackedPR] = field(default_factory=list)

    def pr_by_number(self, pr_number: PRNumber) -> Optional[StackedPR]:
        for pr in self.prs:
            if pr.pr_number == pr_number:
                return pr
        return None

    def pr_by_position(self, position: int) -> Optional[StackedPR]:
        for pr in self.prs:
            if pr.position == position:
                return pr
        return None

    def ordered_prs(self) -> list[StackedPR]:
        return sorted(self.prs, key=lambda p: p.position)
