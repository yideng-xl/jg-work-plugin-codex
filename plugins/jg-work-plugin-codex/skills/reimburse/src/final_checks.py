"""报销终稿交付前的不可变字段检查。"""

from pathlib import Path

import openpyxl


EXPECTED_TITLES = {
    "oa_general": "上海巨耕-报销金额明细",
    "oa_travel": "上海巨耕-差旅报销明细",
    "travel_detail": "上海巨耕-交通费报销明细",
}


def validate_final_workbook_title(path: str | Path, kind: str) -> None:
    """检查终稿 A1 标题；任何替换或模板串用都直接失败。"""
    if kind not in EXPECTED_TITLES:
        raise ValueError(f"未知报销终稿类型：{kind}")

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=False)
    try:
        actual = workbook.active["A1"].value
    finally:
        workbook.close()

    expected = EXPECTED_TITLES[kind]
    if actual != expected:
        raise ValueError(
            f"报销终稿标题错误：{path} 的 A1 应为“{expected}”，实际为“{actual}”"
        )


def validate_final_workbook_titles(checks: list[tuple[str | Path, str]]) -> None:
    """批量检查；应在所有写入完成后、交付前最后调用。"""
    for path, kind in checks:
        validate_final_workbook_title(path, kind)
