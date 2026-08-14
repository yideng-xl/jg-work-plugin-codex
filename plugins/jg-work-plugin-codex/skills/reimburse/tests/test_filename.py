from src.parsers.filename import parse_gaode_filename

def test_parse_gaode():
    r = parse_gaode_filename("【测试出行-60.00元-3个行程】高德打车电子发票.pdf")
    assert r == {"platform": "测试出行", "amount": 60.00, "trip_count": 3}

def test_parse_gaode_single():
    r = parse_gaode_filename("【及时用车-12.90元-1个行程】高德打车电子发票.pdf")
    assert r["platform"] == "及时用车"
    assert r["amount"] == 12.90
    assert r["trip_count"] == 1

def test_non_gaode():
    assert parse_gaode_filename("00000000000000000001.pdf") is None
