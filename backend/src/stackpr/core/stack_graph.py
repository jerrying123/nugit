"""Stack dependency graph and absorb patch computation."""

from typing import Optional

from stackpr.core.models import Stack, StackedPR, PRNumber


def build_stack_graph(prs: list[StackedPR]) -> dict[PRNumber, list[StackedPR]]:
    """Build DAG of PR dependencies: each PR's descendants (PRs that have it as base).
    prs must be ordered by position (0 = closest to main).
    """
    ordered = sorted(prs, key=lambda p: p.position)
    graph: dict[PRNumber, list[StackedPR]] = {}
    for i, pr in enumerate(ordered):
        graph[pr.pr_number] = ordered[i + 1 :]
    return graph


def find_affected_descendants(stack: Stack, pr_number: PRNumber) -> list[StackedPR]:
    """Return all PRs in the stack that sit above the given PR (depend on it)."""
    ordered = stack.ordered_prs()
    found = False
    result = []
    for pr in ordered:
        if pr.pr_number == pr_number:
            found = True
            continue
        if found:
            result.append(pr)
    return result


def compute_absorb_patch(parent_diff: str, child_diff: str) -> str:
    """Compute the patch to apply on the child (tip) to absorb parent changes.
    Simplified: concatenate parent diff then child diff; real impl would merge
    patches and resolve conflicts. Returns unified diff string.
    """
    if not parent_diff and not child_diff:
        return ""
    if not parent_diff:
        return child_diff
    if not child_diff:
        return parent_diff
    return parent_diff.rstrip() + "\n" + child_diff.lstrip()
