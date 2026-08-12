from src.parsers.itinerary_pdf import parse_itinerary_text

# 真实抽取自【曹操出行-185.82元-3个行程】高德打车电子行程单.pdf（Step 1 dump）。
# 版式：表头「序号 服务商 车型 上车时间 城市 起点 终点 金额」，每行一个行程；
# 起点/终点地址若较长，pypdf 抽取时会在地址内部插入换行（无空格），但起点与终点
# 之间始终以一个空格分隔。
SAMPLE = """高德地图—打车——行程单
AMAP ITINERARY
申请时间：2026-07-08 行程时间：2024-11-01 07:42至2026-05-16 14:09
行程人手机号：13501724160 共计3单行程，合计185.82元
序号 服务商 车型 上车时间 城市 起点 终点 金额
1 曹操出行 优享型 2024-11-01 07:42 上海市 融创壹号公
馆(南门)南侧 上海虹桥站(北进站口) 145.62元
2 曹操出行 经济型 2026-04-18 14:14 上海市 闵行体育公
园(1号门)西侧 上海虹桥站(南进站口) 21.36元
3 曹操出行 经济型 2026-05-16 13:57 上海市 上海海派艺术馆
西北侧(新镇路) 上海虹桥站南出发层 18.84元
页码： 1 / 1"""


def test_parse_itinerary():
    trips = parse_itinerary_text(SAMPLE)
    assert len(trips) == 3
    assert trips[0] == {"from": "融创壹号公馆(南门)南侧", "to": "上海虹桥站(北进站口)"}
    assert trips[1] == {"from": "闵行体育公园(1号门)西侧", "to": "上海虹桥站(南进站口)"}
    assert trips[2] == {"from": "上海海派艺术馆西北侧(新镇路)", "to": "上海虹桥站南出发层"}


def test_empty():
    assert parse_itinerary_text("没有行程") == []


# 真实抽取自【风韵出行-55.54元-2个行程】高德打车电子行程单.pdf：验证换行落在
# 「终点」字段内部（而不是起点字段内部）时也能正确切分。
SAMPLE_WRAP_IN_DEST = """序号 服务商 车型 上车时间 城市 起点 终点 金额
1 风韵出行 经济型 2025-12-19 18:46 长沙市 觅云悦上酒店(省博物
院湘雅医院地铁站店) 长沙北辰洲际酒店 11.88元
2 风韵出行 特惠快车 2025-12-21 12:49 长沙市 长沙北辰洲际酒店大堂 长沙黄花国际机场
T2航站楼(国内到达) 43.66元
页码： 1 / 1"""


def test_parse_itinerary_wrap_in_destination():
    trips = parse_itinerary_text(SAMPLE_WRAP_IN_DEST)
    assert len(trips) == 2
    assert trips[0] == {"from": "觅云悦上酒店(省博物院湘雅医院地铁站店)", "to": "长沙北辰洲际酒店"}
    assert trips[1] == {"from": "长沙北辰洲际酒店大堂", "to": "长沙黄花国际机场T2航站楼(国内到达)"}


# 真实抽取自【首汽约车-28.44元-1个行程】高德打车电子行程单.pdf：起点/终点之间的
# 分隔空格恰好被换行吞掉，pypdf 抽取文本里完全没有空格可切分。已知限制：这种情况
# 无法可靠地区分起点与终点，返回 from/to 均为 None，但仍保留该行程（不静默丢弃）。
SAMPLE_LOST_SEPARATOR = """序号 服务商 车型 上车时间 城市 起点 终点 金额
1 首汽约车 经济型 2025-05-08 18:14 上海市 湾谷科技园C5
座西南侧对面
关东情东北人家
(新业坊源创全
球科创示范区店)
28.44元
页码： 1 / 1"""


def test_parse_itinerary_lost_separator_returns_none_but_keeps_trip():
    trips = parse_itinerary_text(SAMPLE_LOST_SEPARATOR)
    assert len(trips) == 1
    assert trips[0] == {"from": None, "to": None}
