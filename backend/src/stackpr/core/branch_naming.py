"""Synthetic branch naming for stacks."""

from stackpr.core.models import StackId


def synthetic_base_branch(username: str, stack_id: StackId, position: int) -> str:
    """Synthetic base branch for a PR at the given position in the stack.
    e.g. stackpr/alice/abc123/0/base
    """
    return f"stackpr/{username}/{stack_id}/{position}/base"


def orig_branch(username: str, stack_id: StackId, position: int) -> str:
    """Original (head) branch name for a PR at the given position.
    e.g. stackpr/alice/abc123/0/orig
    """
    return f"stackpr/{username}/{stack_id}/{position}/orig"
