from src.parsers.train_pdf import parse_train_text

SAMPLE = """国 家 税 务 总 局
发票号码 :26319166100008219443
Shanghaihongqiao
G7549
2026 年 06 月 09 日
电子发票（铁路电子客票）
08:12 开 04 车 07A 号
票价 : ￥ 151.00
二等座
3406031986****0216 许磊
开票日期 :2026 年 06 月 26 日
Ningbo
宁波 站上海虹桥 站
中国铁路祝您旅途愉快"""

def test_parse_train():
    r = parse_train_text(SAMPLE)
    assert r["is_train"] is True
    assert r["invoice_kind"] == "铁路电子客票"
    assert r["amount"] == 151.00
    assert r["tax"] is None
    assert r["date"] == "2026-06-09"       # 乘车日期
    assert r["depart_time"] == "08:12"
    assert r["from_"] == "上海虹桥"
    assert r["to"] == "宁波"

def test_not_train():
    assert parse_train_text("随便一段文本")["is_train"] is False
