from src.parsers.itinerary_pdf import parse_itinerary_text, parse_itinerary_pdf

# 匿名样例。版式：表头「序号 服务商 车型 上车时间 城市 起点 终点 金额」，每行一个行程；
# 起点/终点地址若较长，pypdf 抽取时会在地址内部插入换行（无空格），但起点与终点
# 之间始终以一个空格分隔。
SAMPLE = """高德地图—打车——行程单
AMAP ITINERARY
申请时间：2099-01-20 行程时间：2099-01-10 07:42至2099-01-12 14:09
行程人手机号：13800000000 共计3单行程，合计60.00元
序号 服务商 车型 上车时间 城市 起点 终点 金额
1 测试出行 优享型 2099-01-10 07:42 甲城市 公司附近茶
馆(南门)南侧 甲城火车站(北进站口) 20.00元
2 测试出行 经济型 2099-01-11 14:14 甲城市 城市体育公
园(1号门)西侧 甲城火车站(南进站口) 20.00元
3 测试出行 经济型 2099-01-12 13:57 甲城市 城市艺术馆
西北侧(测试路) 甲城火车站南出发层 20.00元
页码： 1 / 1"""


def test_parse_itinerary():
    trips = parse_itinerary_text(SAMPLE)
    assert len(trips) == 3
    assert trips[0] == {"from": "公司附近茶馆(南门)南侧", "to": "甲城火车站(北进站口)"}
    assert trips[1] == {"from": "城市体育公园(1号门)西侧", "to": "甲城火车站(南进站口)"}
    assert trips[2] == {"from": "城市艺术馆西北侧(测试路)", "to": "甲城火车站南出发层"}


def test_empty():
    assert parse_itinerary_text("没有行程") == []


# 匿名样例：验证换行落在「终点」字段内部（而不是起点字段内部）时也能正确切分。
SAMPLE_WRAP_IN_DEST = """序号 服务商 车型 上车时间 城市 起点 终点 金额
1 测试出行 经济型 2099-02-19 18:46 乙城市 测试酒店(城市博物
馆地铁站店) 乙城会议酒店 10.00元
2 测试出行 特惠快车 2099-02-21 12:49 乙城市 乙城会议酒店大堂 乙城国际机场
T2航站楼(国内到达) 40.00元
页码： 1 / 1"""


def test_parse_itinerary_wrap_in_destination():
    trips = parse_itinerary_text(SAMPLE_WRAP_IN_DEST)
    assert len(trips) == 2
    assert trips[0] == {"from": "测试酒店(城市博物馆地铁站店)", "to": "乙城会议酒店"}
    assert trips[1] == {"from": "乙城会议酒店大堂", "to": "乙城国际机场T2航站楼(国内到达)"}


# 匿名样例：起点/终点之间的分隔空格恰好被换行吞掉，文本里完全没有空格可切分。
# 已知限制：这种情况
# 无法可靠地区分起点与终点，返回 from/to 均为 None，但仍保留该行程（不静默丢弃）。
SAMPLE_LOST_SEPARATOR = """序号 服务商 车型 上车时间 城市 起点 终点 金额
1 测试出行 经济型 2099-03-08 18:14 丙城市 测试科技园C5
座西南侧对面
测试餐厅
(创新园区店)
30.00元
页码： 1 / 1"""


def test_parse_itinerary_lost_separator_returns_none_but_keeps_trip():
    trips = parse_itinerary_text(SAMPLE_LOST_SEPARATOR)
    assert len(trips) == 1
    assert trips[0] == {"from": None, "to": None}


def _make_itinerary_pdf(path):
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    font = "china-s"
    for x, text in [(50, "序号"), (80, "服务商"), (130, "车型"), (215, "上车时间"),
                    (315, "城市"), (380, "起点"), (455, "终点"), (520, "金额")]:
        page.insert_text((x, 100), text, fontname=font)
    page.insert_text((360, 130), "公司附近茶", fontname=font)
    for x, text in [(50, "1"), (80, "测试出行"), (130, "经济型"),
                    (198, "2099-01-10 09:30"), (312, "甲城市"),
                    (432, "入住酒店"), (516, "20.00元")]:
        page.insert_text((x, 140), text, fontname=font)
    page.insert_text((362, 150), "馆南门", fontname=font)
    doc.save(path)
    doc.close()


def test_itinerary_pdf_uses_columns_and_joins_wrapped_addresses(tmp_path):
    path = str(tmp_path / "itinerary.pdf")
    _make_itinerary_pdf(path)
    trips = parse_itinerary_pdf(path)
    assert trips == [{
        "from": "公司附近茶馆南门",
        "to": "入住酒店",
        "date": "2099-01-10",
        "time": "09:30",
    }]
