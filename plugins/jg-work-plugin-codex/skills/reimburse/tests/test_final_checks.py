import openpyxl
import pytest

from src.final_checks import validate_final_workbook_title, validate_final_workbook_titles
from src.oa_forms import write_oa_travel_detail
from src.summary_io import write_travel_detail


def test_final_titles_accept_exact_legal_company_name(tmp_path):
    oa_path = tmp_path / "09-终稿-OA差旅报销明细.xlsx"
    travel_path = tmp_path / "09-终稿-交通费明细.xlsx"
    write_oa_travel_detail([], [], str(oa_path))
    write_travel_detail([], str(travel_path), applicant="张三")

    validate_final_workbook_titles([
        (oa_path, "oa_travel"),
        (travel_path, "travel_detail"),
    ])


def test_final_title_rejects_generic_company_replacement(tmp_path):
    path = tmp_path / "09-终稿-交通费明细.xlsx"
    write_travel_detail([], str(path), applicant="张三")

    workbook = openpyxl.load_workbook(path)
    workbook.active["A1"] = "公司-交通费报销明细"
    workbook.save(path)

    with pytest.raises(ValueError, match="应为“上海巨耕-交通费报销明细”"):
        validate_final_workbook_title(path, "travel_detail")
