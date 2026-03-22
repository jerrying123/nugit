"""Tests for `.nugit/stack.json` parsing."""

import pytest

from stackpr.core.nugit_file import (
    NugitValidationError,
    document_to_json_dict,
    parse_nugit_stack_json,
)


def test_parse_minimal() -> None:
    raw = """
    {
      "version": 1,
      "repo_full_name": "o/r",
      "created_by": "alice",
      "prs": [{"pr_number": 1, "position": 0}]
    }
    """
    doc = parse_nugit_stack_json(raw)
    assert doc.repo_full_name == "o/r"
    assert len(doc.prs) == 1
    assert doc.prs[0].pr_number == 1


def test_duplicate_pr_rejected() -> None:
    raw = """{"version":1,"repo_full_name":"o/r","created_by":"a","prs":[
      {"pr_number":1,"position":0},{"pr_number":1,"position":1}]}"""
    with pytest.raises(NugitValidationError):
        parse_nugit_stack_json(raw)


def test_round_trip_dict() -> None:
    doc = parse_nugit_stack_json(
        '{"version":1,"repo_full_name":"o/r","created_by":"a","prs":[{"pr_number":2,"position":0}]}'
    )
    d = document_to_json_dict(doc)
    assert d["version"] == 1
    assert d["prs"][0]["pr_number"] == 2
