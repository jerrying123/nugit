"""Rebase and absorb planning."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from stackpr.core.models import Stack, StackedPR, PRNumber


class ConflictRiskLevel(str, Enum):
    none = "none"
    low = "low"
    high = "high"


@dataclass
class RebaseOperation:
    pr_number: PRNumber
    new_base_sha: str
    position: int


@dataclass
class AbsorbOperation:
    target_pr_number: PRNumber  # tip PR
    diff_patch: str
    source_pr_number: PRNumber


@dataclass
class ConflictRisk:
    level: ConflictRiskLevel
    message: str = ""


def plan_cascade(stack: Stack, changed_pr: StackedPR) -> list[RebaseOperation]:
    """Plan rebase operations for all descendants of the changed PR.
    Each descendant gets its base updated to the new head of its parent.
    """
    ordered = stack.ordered_prs()
    idx = next((i for i, p in enumerate(ordered) if p.pr_number == changed_pr.pr_number), None)
    if idx is None:
        return []
    operations = []
    for i, pr in enumerate(ordered[idx + 1 :], start=idx + 1):
        parent = ordered[i - 1]
        operations.append(
            RebaseOperation(
                pr_number=pr.pr_number,
                new_base_sha=parent.head_sha,
                position=pr.position,
            )
        )
    return operations


def plan_absorb_to_tip(stack: Stack, changed_pr: StackedPR, diff_patch: str) -> Optional[AbsorbOperation]:
    """Plan absorb-to-tip: apply diff at the tip PR only."""
    ordered = stack.ordered_prs()
    if not ordered:
        return None
    tip = ordered[-1]
    return AbsorbOperation(
        target_pr_number=tip.pr_number,
        diff_patch=diff_patch,
        source_pr_number=changed_pr.pr_number,
    )


def _extract_files_from_patch(patch: str) -> set[str]:
    """Extract file paths from unified diff (--- a/path or +++ b/path)."""
    files = set()
    for line in patch.splitlines():
        if line.startswith("--- ") or line.startswith("+++ "):
            path = line[4:].strip()
            if path and path != "/dev/null":
                if path.startswith("a/") or path.startswith("b/"):
                    path = path[2:]
                files.add(path)
    return files


def estimate_conflict_risk(base_patch: str, child_patch: str) -> ConflictRisk:
    """Heuristic conflict risk when applying base_patch then child_patch."""
    if not base_patch or not child_patch:
        return ConflictRisk(level=ConflictRiskLevel.none)
    base_files = _extract_files_from_patch(base_patch)
    child_files = _extract_files_from_patch(child_patch)
    overlap = base_files & child_files
    if len(overlap) > 2:
        return ConflictRisk(level=ConflictRiskLevel.high, message=f"Many overlapping files: {len(overlap)}")
    if overlap:
        return ConflictRisk(level=ConflictRiskLevel.low, message=f"Overlapping files: {overlap}")
    return ConflictRisk(level=ConflictRiskLevel.none)
