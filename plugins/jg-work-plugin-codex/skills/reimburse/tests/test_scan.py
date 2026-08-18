import json
from pathlib import Path
import src.scan as scan
from src.scan import scan_folder, build_copies

XML = """<?xml version="1.0"?><EInvoice><Header><InherentLabel>
<GeneralOrSpecialVAT><LabelCode>02</LabelCode></GeneralOrSpecialVAT></InherentLabel></Header>
<EInvoiceData><SellerInformation><SellerName>测试公司</SellerName></SellerInformation>
<BasicInformation><TotalTax-includedAmount>50.00</TotalTax-includedAmount>
<RequestTime>2026-05-01 10:00:00</RequestTime></BasicInformation>
<IssuItemInformation><ItemName>*餐饮*</ItemName></IssuItemInformation></EInvoiceData></EInvoice>"""

TRAIN_SAMPLE = """国 家 税 务 总 局
发票号码 :00000000000000000001
乙地站
G0001
2099 年 01 月 10 日
电子发票（铁路电子客票）
08:12 开 04 车 07A 号
票价 : ￥ 100.00
二等座
0000000000****0000 测试用户
开票日期 :2099 年 01 月 15 日
甲地站
甲地 站乙地 站
中国铁路祝您旅途愉快"""

def test_build_copies():
    assert build_copies("普票") == 1
    assert build_copies("专票") == 2
    assert build_copies("铁路电子客票") == 2

def test_scan_xml_ticket(tmp_path):
    d = tmp_path / "报销1"
    d.mkdir()
    (d / "【某平台-50.00元-1个行程】发票.xml").write_text(XML, encoding="utf-8")
    (d / "【某平台-50.00元-1个行程】发票.pdf").write_bytes(b"%PDF-1.4 fake")
    tickets = scan_folder(str(d))
    assert len(tickets) == 1
    t = tickets[0]
    assert t["invoice_kind"] == "普票"
    assert t["amount"] == 50.00
    assert t["copies"] == 1
    assert t["seller"] == "测试公司"
    assert t["trip_count"] == 1          # 来自文件名
    assert t["is_prepaid"] is False
    assert t["pdf_path"].endswith(".pdf")

def test_scan_train_pdf_no_xml(tmp_path, monkeypatch):
    d = tmp_path / "报销2"
    d.mkdir()
    (d / "00000000000000000001.pdf").write_bytes(b"%PDF fake")

    monkeypatch.setattr(scan, "extract_pdf_text", lambda path: TRAIN_SAMPLE)

    tickets = scan_folder(str(d))
    assert len(tickets) == 1
    t = tickets[0]
    assert t["source_type"] == "train_pdf"
    assert t["invoice_kind"] == "铁路电子客票"
    assert t["copies"] == 2
    assert t["amount"] == 100.0
    assert t["is_prepaid"] is False
    assert len(t["trips"]) == 1
    assert t["trips"][0]["from"] == "甲地"
    assert t["trips"][0]["to"] == "乙地"
    assert t["depart_time"] == "08:12"
    assert t["train_no"] == "G0001"

# 另一版铁路电子客票：开票日期排在乘车日期前面，"票价:"与"￥446.00"中间
# 隔了座别/身份证号等（旧正则漏解析金额、且把开票日当成乘车日）。
TRAIN_SAMPLE2 = """国 家 税 务 总 局
开票日期:2026年04月22日
发票号码:00000000000000000002
甲地
站
乙地
站
G1916
2026年04月13日
16:09开
08车09A号
票价:
二等座
0000000000****0000
测试用户
电子发票（铁路电子客票）
￥
446.00"""


def test_parse_train_separated_layout():
    from src.parsers.train_pdf import parse_train_text
    r = parse_train_text(TRAIN_SAMPLE2)
    assert r["is_train"] is True
    assert r["amount"] == 446.0          # ￥ 与"票价:"隔开也能抽到
    assert r["date"] == "2026-04-13"     # 乘车日，不是开票日 04-22
    assert r["depart_time"] == "16:09"


def test_scan_bare_pdf_prepaid(tmp_path, monkeypatch):
    d = tmp_path / "报销3"
    d.mkdir()
    (d / "recharge.pdf").write_bytes(b"%PDF fake")

    monkeypatch.setattr(scan, "extract_pdf_text", lambda path: "这是一张预付卡充值凭证，不涉及铁路")

    tickets = scan_folder(str(d))
    assert len(tickets) == 1
    t = tickets[0]
    assert t["source_type"] == "bare_pdf"
    assert t["is_prepaid"] is True

def test_scan_bare_pdf_ride_hailing_item_name(tmp_path, monkeypatch):
    """裸 PDF（无 xml）打车票：PDF 文本里的品名 token 缺"交通"前缀
    （"*运输服务*客运服务费"而非"*交通运输服务*客运服务费"），但公共子串
    "客运服务"仍在，scan.py 要把它提取进 item_name 供 mapping 按
    item_contains 命中，不依赖销售方名称。"""
    d = tmp_path / "报销4"
    d.mkdir()
    (d / "及时用车.pdf").write_bytes(b"%PDF fake")

    monkeypatch.setattr(
        scan, "extract_pdf_text",
        lambda path: "电子发票\n*运输服务*客运服务费 12.52\n不涉及铁路")

    tickets = scan_folder(str(d))
    assert len(tickets) == 1
    t = tickets[0]
    assert t["source_type"] == "bare_pdf"
    assert t["is_prepaid"] is False
    assert t["item_name"] is not None
    assert "客运服务" in t["item_name"]


def test_scan_excludes_own_outputs(tmp_path, monkeypatch):
    d = tmp_path / "报销"
    d.mkdir()
    (d / "【曹操出行-50.00元-1个行程】高德打车电子发票.pdf").write_bytes(b"%PDF fake")
    # skill 上次生成的产出物, 不应被当成发票
    (d / "A4拼贴.pdf").write_bytes(b"%PDF fake")
    (d / "报销摘要.xlsx").write_bytes(b"fake")
    (d / "交通费明细.xlsx").write_bytes(b"fake")
    import src.scan as scan
    monkeypatch.setattr(scan, "extract_pdf_text", lambda path: "*运输服务*客运服务费 50.00")
    tickets = scan.scan_folder(str(d))
    # 只认那 1 张发票, A4拼贴.pdf / xlsx 产出物被排除
    assert len(tickets) == 1
    assert "曹操" in tickets[0]["file_stem"]


def test_scan_excludes_prefixed_final_outputs(tmp_path, monkeypatch):
    d = tmp_path / "报销"
    d.mkdir()
    (d / "原始发票.pdf").write_bytes(b"%PDF fake")
    (d / "05-需确认-报销摘要.xlsx").write_bytes(b"fake")
    (d / "09-终稿-A4发票-普票-打印1张.pdf").write_bytes(b"%PDF fake")
    monkeypatch.setattr(scan, "extract_pdf_text", lambda path: "普通发票")
    tickets = scan_folder(str(d))
    assert len(tickets) == 1
    assert tickets[0]["file_stem"] == "原始发票"
