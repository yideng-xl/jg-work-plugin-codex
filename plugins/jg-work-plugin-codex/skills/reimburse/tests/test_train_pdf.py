from src.parsers.train_pdf import parse_train_text

SAMPLE = """国 家 税 务 总 局
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

def test_parse_train():
    r = parse_train_text(SAMPLE)
    assert r["is_train"] is True
    assert r["invoice_kind"] == "铁路电子客票"
    assert r["amount"] == 100.00
    assert r["tax"] is None
    assert r["date"] == "2099-01-10"       # 乘车日期
    assert r["depart_time"] == "08:12"
    assert r["train_no"] == "G0001"
    assert r["from_"] == "甲地"
    assert r["to"] == "乙地"

def test_not_train():
    assert parse_train_text("随便一段文本")["is_train"] is False
