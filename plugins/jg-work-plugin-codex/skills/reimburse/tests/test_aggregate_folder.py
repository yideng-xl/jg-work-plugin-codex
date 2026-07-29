import src.scan as scan
from src.aggregate_folder import (category_of, is_ride_hailing,
                                  summarize_folder, TAXI_REASON_DEFAULT)

TRAIN = """电子发票（铁路电子客票）
开票日期:2026年04月22日
发票号码:26319166100004942424
上海虹桥 站
郑州东 站
2026年04月13日
16:09开
票价:
二等座
3406031986****0216
￥
446.00"""


def _make_folder(tmp_path):
    d = tmp_path / "2026-04-10"
    (d / "差旅费-交通费").mkdir(parents=True)
    (d / "差旅-住宿费").mkdir(parents=True)
    (d / "差旅费-交通费" / "【及时用车-12.90元-1个行程】高德打车电子发票.pdf").write_bytes(b"%PDF x")
    (d / "差旅费-交通费" / "26319166100004942424.pdf").write_bytes(b"%PDF x")
    (d / "差旅-住宿费" / "住宿发票.pdf").write_bytes(b"%PDF x")
    return d


def _fake_text(path):
    if "26319166100004942424" in path:
        return TRAIN
    if "及时用车" in path:
        return "电子发票\n*运输服务*客运服务费 12.90\n"
    if "住宿" in path:
        return "电子发票（增值税专用发票）\n*住宿服务*住宿服务\n"
    return ""


def test_category_of_uses_subfolder(tmp_path, monkeypatch):
    d = _make_folder(tmp_path)
    monkeypatch.setattr(scan, "extract_pdf_text", _fake_text)
    tickets = scan.scan_folder(str(d))
    cats = {category_of(t, str(d)) for t in tickets}
    assert "差旅费-交通费" in cats
    assert "差旅-住宿费" in cats


def test_is_ride_hailing():
    assert is_ride_hailing({"invoice_kind": "unknown", "item_name": "*运输服务*客运服务费",
                            "file_stem": "x"})
    assert is_ride_hailing({"invoice_kind": "unknown", "item_name": None,
                            "file_stem": "【及时用车-12.90元-1个行程】高德打车电子发票"})
    # 铁路不是打车
    assert not is_ride_hailing({"invoice_kind": "铁路电子客票",
                                "item_name": None, "file_stem": "123"})


def test_summarize_folder(tmp_path, monkeypatch):
    d = _make_folder(tmp_path)
    monkeypatch.setattr(scan, "extract_pdf_text", _fake_text)
    r = summarize_folder(str(d))

    # 交通费大类 = 打车 12.90 + 高铁 446 = 458.90（住宿无金额不计入）
    trans = [c for c in r["by_category"] if c["category"] == "差旅费-交通费"]
    assert len(trans) == 1
    assert trans[0]["amount"] == 458.9
    assert trans[0]["tax"] == 0.0            # 普票税额写 0

    # 交通费明细表只放打车（1 张），高铁不进；打车原因预填默认，日期/起止地留空
    assert len(r["taxi_detail"]) == 1
    taxi = r["taxi_detail"][0]
    assert taxi["amount"] == 12.9
    assert taxi["reason"] == TAXI_REASON_DEFAULT
    assert taxi["date"] is None

    # 住宿发票没金额 → unparsed，等用户/住宿解析补
    assert any("住宿" in t["file_stem"] for t in r["unparsed"])
