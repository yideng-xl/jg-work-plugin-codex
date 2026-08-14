from src.parsers.train_pdf import parse_train_text, parse_train_pdf, _stations_by_x

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


def _make_train_pdf(path, reverse_insert=False):
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    stations = [(72, "甲地站"), (320, "乙地站")]
    if reverse_insert:
        stations.reverse()
    for x, text in stations:
        page.insert_text((x, 100), text, fontname="china-s")
    page.insert_text((72, 140), "电子发票（铁路电子客票）", fontname="china-s")
    doc.save(path)
    doc.close()


def test_train_pdf_uses_visual_left_as_departure(tmp_path):
    path = str(tmp_path / "train.pdf")
    _make_train_pdf(path, reverse_insert=True)
    stations = _stations_by_x(path)
    assert [name for name, _ in stations] == ["甲地", "乙地"]

    reversed_text = "电子发票（铁路电子客票）\n乙地站\n甲地站"
    result = parse_train_pdf(path, text=reversed_text)
    assert result["from_"] == "甲地"
    assert result["to"] == "乙地"


def test_train_coordinate_parser_ignores_station_text_on_other_rows(tmp_path):
    import fitz

    path = str(tmp_path / "train-extra.pdf")
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((20, 40), "请前往某某站取票", fontname="china-s")
    page.insert_text((72, 100), "甲地站", fontname="china-s")
    page.insert_text((320, 100), "乙地站", fontname="china-s")
    doc.save(path)
    doc.close()
    assert [name for name, _ in _stations_by_x(path)] == ["甲地", "乙地"]
