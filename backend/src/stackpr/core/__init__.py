"""Core domain logic: stack model, graph, rebase planning, branch naming."""

from stackpr.core.models import (
    StackId,
    PRNumber,
    Stack as CoreStack,
    StackedPR as CoreStackedPR,
    ReconciliationRecord,
)
from stackpr.core.stack_graph import (
    build_stack_graph,
    find_affected_descendants,
    compute_absorb_patch,
)
from stackpr.core.rebase_plan import (
    plan_cascade,
    plan_absorb_to_tip,
    estimate_conflict_risk,
    RebaseOperation,
    AbsorbOperation,
    ConflictRisk,
    ConflictRiskLevel,
)
from stackpr.core.branch_naming import synthetic_base_branch, orig_branch

__all__ = [
    "StackId",
    "PRNumber",
    "CoreStack",
    "CoreStackedPR",
    "ReconciliationRecord",
    "build_stack_graph",
    "find_affected_descendants",
    "compute_absorb_patch",
    "plan_cascade",
    "plan_absorb_to_tip",
    "estimate_conflict_risk",
    "RebaseOperation",
    "AbsorbOperation",
    "ConflictRisk",
    "ConflictRiskLevel",
    "synthetic_base_branch",
    "orig_branch",
]
