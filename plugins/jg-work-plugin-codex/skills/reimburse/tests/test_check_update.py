import json
import subprocess

from scripts.check_update import check_update


def completed(args, returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args, returncode, stdout, stderr)


def test_not_configured_does_not_upgrade(monkeypatch):
    monkeypatch.setattr("scripts.check_update.shutil.which", lambda _: "/usr/bin/codex")
    calls = []

    def run(args, timeout):
        calls.append(args)
        return completed(args, stdout=json.dumps([{"name": "another-market"}]))

    result = check_update(run)
    assert result["status"] == "not_configured"
    assert len(calls) == 1


def test_same_head_is_current(monkeypatch):
    monkeypatch.setattr("scripts.check_update.shutil.which", lambda _: "/usr/bin/codex")

    def run(args, timeout):
        if args[:4] == ["codex", "plugin", "marketplace", "list"]:
            return completed(args, stdout=json.dumps([{"name": "jg-work", "path": "/tmp/jg-work"}]))
        if args[0] == "git":
            return completed(args, stdout="abc123\n")
        return completed(args, stdout="{}")

    assert check_update(run)["status"] == "current"


def test_changed_head_requires_new_task(monkeypatch):
    monkeypatch.setattr("scripts.check_update.shutil.which", lambda _: "/usr/bin/codex")
    heads = iter(("old123\n", "new456\n"))

    def run(args, timeout):
        if args[:4] == ["codex", "plugin", "marketplace", "list"]:
            return completed(args, stdout=json.dumps([{"name": "jg-work", "root": "/tmp/jg-work"}]))
        if args[0] == "git":
            return completed(args, stdout=next(heads))
        return completed(args, stdout="{}")

    result = check_update(run)
    assert result["status"] == "updated"
    assert result["before"] == "old123"
    assert result["after"] == "new456"


def test_upgrade_failure_is_non_blocking(monkeypatch):
    monkeypatch.setattr("scripts.check_update.shutil.which", lambda _: "/usr/bin/codex")

    def run(args, timeout):
        if args[:4] == ["codex", "plugin", "marketplace", "list"]:
            return completed(args, stdout=json.dumps([{"name": "jg-work", "path": "/tmp/jg-work"}]))
        if args[0] == "git":
            return completed(args, stdout="abc123\n")
        return completed(args, returncode=1, stderr="network unavailable")

    result = check_update(run)
    assert result["status"] == "check_failed"
    assert "当前版本" in result["message"]
