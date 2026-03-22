"""Pytest fixtures for core and API tests."""

import pytest
from datetime import datetime

from stackpr.core.models import Stack, StackedPR, ReconciliationRecord


@pytest.fixture
def sample_prs() -> list[StackedPR]:
    return [
        StackedPR(
            pr_number=41,
            position=0,
            head_branch="feature/auth-model",
            base_branch="main",
            head_sha="aaa111",
            base_sha="000000",
            status="open",
        ),
        StackedPR(
            pr_number=42,
            position=1,
            head_branch="feature/auth-middleware",
            base_branch="stackpr/alice/stack1/0/base",
            head_sha="bbb222",
            base_sha="aaa111",
            status="open",
        ),
        StackedPR(
            pr_number=43,
            position=2,
            head_branch="feature/auth-ui",
            base_branch="stackpr/alice/stack1/1/base",
            head_sha="ccc333",
            base_sha="bbb222",
            status="open",
        ),
    ]


@pytest.fixture
def sample_stack(sample_prs: list[StackedPR]) -> Stack:
    return Stack(
        id="stack1",
        repo_full_name="owner/repo",
        created_by="alice",
        prs=sample_prs,
    )
