#!/usr/bin/env python3
"""Focused checks for Trellis context leaf policy and start gating."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / ".trellis" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from common.context_documents import INDEX_MARKER, validate_context_document


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ContextDocumentPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        self.task = self.repo / ".trellis" / "tasks" / "07-30-test"
        (self.repo / ".trellis" / "spec" / "backend").mkdir(parents=True)
        (self.task / "research").mkdir(parents=True)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def check(self, relative: str, content: str, cap: int = 32768):
        path = self.repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return validate_context_document(self.repo, self.task, relative, cap)

    def test_accepts_only_in_scope_markdown_leaves_within_cap(self) -> None:
        resolved, error = self.check(".trellis/spec/backend/leaf.md", "leaf")
        self.assertIsNotNone(resolved)
        self.assertIsNone(error)

        cases = [
            (".trellis/spec/backend/index.md", "index", "index documents"),
            (".trellis/spec/backend/compat.md", INDEX_MARKER, "index documents"),
            (".trellis/spec/backend/code.py", "pass", "only Markdown"),
            ("docs/outside.md", "outside", "path must be under"),
            (".trellis/spec/backend/large.md", "x" * 33, "limit is 32"),
        ]
        for relative, content, expected in cases:
            with self.subTest(relative=relative):
                _, error = self.check(relative, content, 32)
                self.assertIn(expected, error or "")

        _, error = validate_context_document(
            self.repo, self.task, ".trellis/spec/backend", 32768
        )
        self.assertIn("directories", error or "")

        external_task = self.repo.parent / "external-task"
        (external_task / "research").mkdir(parents=True, exist_ok=True)
        external_leaf = external_task / "research" / "leaf.md"
        external_leaf.write_text("outside", encoding="utf-8")
        for path in (str(external_leaf), "../external-task/research/leaf.md"):
            with self.subTest(path=path):
                _, error = validate_context_document(self.repo, self.task, path, 32768)
                self.assertIn("path", error or "")
        _, error = validate_context_document(
            self.repo, external_task, str(external_leaf), 32768
        )
        self.assertIn("task directory must be under", error or "")

    def test_hook_supports_index_and_keeps_valid_leaf(self) -> None:
        leaf = ".trellis/spec/backend/leaf.md"
        index = ".trellis/spec/backend/index.md"
        self.check(leaf, "LEAF-CONTENT")
        self.check(index, "INDEX-CONTENT")
        manifest = self.task / "implement.jsonl"
        manifest.write_text(
            "\n".join(
                json.dumps({"file": path, "reason": "test"})
                for path in (index, leaf)
            ),
            encoding="utf-8",
        )
        hook = load_module(
            "inject_subagent_context_test",
            REPO_ROOT / ".codex" / "hooks" / "inject-subagent-context.py",
        )
        blocks = hook._materialize_jsonl_entries(
            str(self.repo),
            ".trellis/tasks/07-30-test/implement.jsonl",
            dict(hook.DEFAULT_LIMITS),
            hook._Budget(0),
        )
        joined = "\n".join(blocks)
        self.assertIn("INDEX-CONTENT", joined)
        self.assertIn("LEAF-CONTENT", joined)

    def test_hook_ignores_malformed_rows_and_keeps_later_valid_leaf(self) -> None:
        leaf = ".trellis/spec/backend/leaf.md"
        self.check(leaf, "LEAF-CONTENT")
        manifest = self.task / "implement.jsonl"
        manifest.write_text(
            "\n".join(("null", "[]", json.dumps({"file": leaf, "reason": "test"}))),
            encoding="utf-8",
        )
        hook = load_module(
            "inject_subagent_context_malformed_test",
            REPO_ROOT / ".codex" / "hooks" / "inject-subagent-context.py",
        )
        blocks = hook._materialize_jsonl_entries(
            str(self.repo),
            ".trellis/tasks/07-30-test/implement.jsonl",
            dict(hook.DEFAULT_LIMITS),
            hook._Budget(0),
        )
        self.assertIn("LEAF-CONTENT", "\n".join(blocks))

        from common import task_context

        self.assertEqual(task_context._validate_jsonl(manifest, self.repo, self.task), 2)

    def test_rejects_research_symlink_that_escapes_task(self) -> None:
        research = self.task / "research"
        research.rmdir()
        outside = self.repo / "outside-research"
        outside.mkdir()
        (outside / "leaf.md").write_text("outside", encoding="utf-8")
        try:
            research.symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"directory symlinks unavailable: {exc}")

        _, error = validate_context_document(
            self.repo,
            self.task,
            ".trellis/tasks/07-30-test/research/leaf.md",
            32768,
        )
        self.assertIn("research/ must resolve inside", error or "")

    def test_start_gates_on_empty_context(self) -> None:
        (self.task / "task.json").write_text(
            json.dumps({"status": "planning"}), encoding="utf-8"
        )
        (self.task / "implement.jsonl").write_text(
            json.dumps({"file": ".trellis/spec/backend/index.md"}),
            encoding="utf-8",
        )
        (self.task / "check.jsonl").write_text("", encoding="utf-8")
        self.check(".trellis/spec/backend/index.md", "index")
        task_module = load_module("task_cli_test", SCRIPTS_DIR / "task.py")
        with (
            patch.object(task_module, "get_repo_root", return_value=self.repo),
            patch.object(task_module, "resolve_task_dir", return_value=self.task.resolve()),
            patch.object(task_module, "set_active_task") as set_active,
        ):
            result = task_module.cmd_start(argparse.Namespace(dir=str(self.task)))

        self.assertEqual(result, 1)
        self.assertFalse(set_active.called)
        data = json.loads((self.task / "task.json").read_text(encoding="utf-8"))
        self.assertEqual(data["status"], "planning")


if __name__ == "__main__":
    unittest.main()
