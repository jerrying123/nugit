"""Tests for core stack graph, rebase plan, and branch naming."""

import pytest
from stackpr.core.models import Stack, StackedPR
from stackpr.core import (
    build_stack_graph,
    find_affected_descendants,
    compute_absorb_patch,
    plan_cascade,
    plan_absorb_to_tip,
    estimate_conflict_risk,
    synthetic_base_branch,
    orig_branch,
    ConflictRiskLevel,
)


def test_build_stack_graph(sample_stack: Stack) -> None:
    graph = build_stack_graph(sample_stack.prs)
    assert 41 in graph
    assert 42 in graph
    assert 43 in graph
    assert len(graph[41]) == 2
    assert graph[41][0].pr_number == 42
    assert graph[41][1].pr_number == 43
    assert len(graph[43]) == 0


def test_find_affected_descendants(sample_stack: Stack) -> None:
    affected = find_affected_descendants(sample_stack, 41)
    assert len(affected) == 2
    assert [p.pr_number for p in affected] == [42, 43]
    affected_42 = find_affected_descendants(sample_stack, 42)
    assert len(affected_42) == 1
    assert affected_42[0].pr_number == 43
    affected_43 = find_affected_descendants(sample_stack, 43)
    assert len(affected_43) == 0


def test_compute_absorb_patch() -> None:
    assert compute_absorb_patch("", "") == ""
    assert compute_absorb_patch("parent", "") == "parent"
    assert compute_absorb_patch("", "child") == "child"
    out = compute_absorb_patch("a\n", "\nb")
    assert "a" in out and "b" in out


def test_plan_cascade(sample_stack: Stack) -> None:
    pr41 = sample_stack.pr_by_number(41)
    assert pr41 is not None
    ops = plan_cascade(sample_stack, pr41)
    assert len(ops) == 2
    assert ops[0].pr_number == 42 and ops[0].new_base_sha == "aaa111"
    assert ops[1].pr_number == 43 and ops[1].new_base_sha == "bbb222"


def test_plan_absorb_to_tip(sample_stack: Stack) -> None:
    pr41 = sample_stack.pr_by_number(41)
    assert pr41 is not None
    op = plan_absorb_to_tip(sample_stack, pr41, "diff content")
    assert op is not None
    assert op.target_pr_number == 43
    assert op.source_pr_number == 41
    assert op.diff_patch == "diff content"


def test_estimate_conflict_risk() -> None:
    r = estimate_conflict_risk("", "")
    assert r.level == ConflictRiskLevel.none
    r = estimate_conflict_risk("--- a/foo\n+++ b/foo", "--- a/bar\n+++ b/bar")
    assert r.level == ConflictRiskLevel.none
    r = estimate_conflict_risk("--- a/foo\n+++ b/foo", "--- a/foo\n+++ b/foo")
    assert r.level == ConflictRiskLevel.low
    r = estimate_conflict_risk(
        "--- a/f1\n+++ b/f1\n--- a/f2\n+++ b/f2\n--- a/f3\n+++ b/f3",
        "--- a/f1\n+++ b/f1\n--- a/f2\n+++ b/f2\n--- a/f3\n+++ b/f3",
    )
    assert r.level == ConflictRiskLevel.high


def test_synthetic_base_branch() -> None:
    assert synthetic_base_branch("alice", "abc123", 0) == "stackpr/alice/abc123/0/base"
    assert synthetic_base_branch("bob", "xyz", 2) == "stackpr/bob/xyz/2/base"


def test_orig_branch() -> None:
    assert orig_branch("alice", "abc123", 0) == "stackpr/alice/abc123/0/orig"
    assert orig_branch("bob", "xyz", 2) == "stackpr/bob/xyz/2/orig"
