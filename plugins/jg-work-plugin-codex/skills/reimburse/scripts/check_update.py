#!/usr/bin/env python3
"""Refresh the JG Work marketplace before starting a new reimbursement."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Callable


RunCommand = Callable[[list[str], int], subprocess.CompletedProcess[str]]


def _run(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _message(text: str) -> str:
    return " ".join((text or "").strip().split())[:300]


def _marketplaces(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("marketplaces", "items", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _marketplace_root(item: dict) -> Path | None:
    for key in ("path", "root", "directory", "checkout_path", "local_path"):
        value = item.get(key)
        if isinstance(value, str) and value:
            return Path(value).expanduser()
    source = item.get("source")
    if isinstance(source, dict):
        for key in ("path", "root", "directory", "checkout_path", "local_path"):
            value = source.get(key)
            if isinstance(value, str) and value:
                return Path(value).expanduser()
    return None


def _git_head(root: Path | None, run: RunCommand) -> str | None:
    if root is None:
        return None
    result = run(["git", "-C", str(root), "rev-parse", "HEAD"], 10)
    if result.returncode != 0:
        return None
    head = result.stdout.strip()
    return head or None


def check_update(run: RunCommand = _run) -> dict[str, str]:
    if shutil.which("codex") is None:
        return {
            "status": "check_failed",
            "message": "未找到 Codex 命令，已继续使用当前版本。",
        }

    try:
        listed = run(["codex", "plugin", "marketplace", "list", "--json"], 20)
        if listed.returncode != 0:
            return {
                "status": "check_failed",
                "message": f"更新检查失败，已继续使用当前版本：{_message(listed.stderr)}",
            }
        payload = json.loads(listed.stdout or "[]")
        marketplace = next(
            (item for item in _marketplaces(payload) if item.get("name") == "jg-work"),
            None,
        )
        if marketplace is None:
            return {
                "status": "not_configured",
                "message": "未配置 jg-work 插件市场，已继续使用当前版本；请按操作手册完成一次安装。",
            }

        root = _marketplace_root(marketplace)
        before = _git_head(root, run)
        upgraded = run(
            ["codex", "plugin", "marketplace", "upgrade", "jg-work", "--json"],
            60,
        )
        if upgraded.returncode != 0:
            return {
                "status": "check_failed",
                "message": f"自动更新失败，已继续使用当前版本：{_message(upgraded.stderr)}",
            }
        after = _git_head(root, run)
        if before and after and before != after:
            return {
                "status": "updated",
                "message": "报销 Skill 已更新，请新建任务后重新发起本次报销。",
                "before": before,
                "after": after,
            }
        if before and after:
            return {"status": "current", "message": "报销 Skill 已是最新版本。"}
        return {"status": "checked", "message": "报销 Skill 更新检查已完成。"}
    except (json.JSONDecodeError, OSError, subprocess.SubprocessError) as exc:
        return {
            "status": "check_failed",
            "message": f"更新检查异常，已继续使用当前版本：{_message(str(exc))}",
        }


def main() -> None:
    print(json.dumps(check_update(), ensure_ascii=False))


if __name__ == "__main__":
    main()
