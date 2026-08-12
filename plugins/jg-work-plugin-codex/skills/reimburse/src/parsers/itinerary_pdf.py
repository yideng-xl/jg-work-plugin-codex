import re

# 高德打车「电子行程单」版式（曹操出行/风韵出行/享道出行/首汽约车/如祺出行等
# 各服务商共用同一个高德模板）：
#   序号 服务商 车型 上车时间 城市 起点 终点 金额
#   1 曹操出行 优享型 2024-11-01 07:42 上海市 融创壹号公
#   馆(南门)南侧 上海虹桥站(北进站口) 145.62元
# 每个行程占一行起始（序号顶格），但起点/终点地址较长时 pypdf 抽取会在地址内部
# 插入换行（无空格）；起点与终点之间则始终以一个空格分隔。
ROW_RE = re.compile(
    r"^\d+\s+\S+\s+\S+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\S+?市\s+(.+?)\s+[\d.]+元",
    re.MULTILINE | re.DOTALL,
)


def parse_itinerary_text(text: str) -> list:
    """解析高德打车电子行程单文本，返回每段行程的起止地。

    已知限制：极少数情况下起点/终点之间的分隔空格会被 PDF 换行吞掉（见
    首汽约车样本），此时无法可靠切分，返回 {"from": None, "to": None}，
    但仍保留该行程条目（不静默丢弃，行程条数与原文一致）。
    """
    trips = []
    for m in ROW_RE.finditer(text):
        mid = m.group(1).replace("\n", "")
        parts = mid.split(" ", 1)
        if len(parts) == 2:
            origin, dest = parts
            trips.append({"from": origin.strip() or None, "to": dest.strip() or None})
        else:
            trips.append({"from": None, "to": None})
    return trips
