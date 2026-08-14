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
AMOUNT_RE = re.compile(r"[\d.]+元")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
TIME_RE = re.compile(r"\d{2}:\d{2}")


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


def _extract_pdf_spans(path: str) -> list[tuple[int, float, float, str]]:
    """返回 PDF 文字坐标：(page, x0, y0, text)。"""
    import fitz

    spans = []
    with fitz.open(path) as doc:
        for page_no, page in enumerate(doc):
            data = page.get_text("dict")
            for block in data.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span["text"].strip()
                        if text:
                            spans.append((page_no, span["bbox"][0], span["bbox"][1], text))
    return spans


def _extract_text_fallback(path: str) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


def parse_itinerary_pdf(path: str) -> list:
    """按高德行程单的视觉列解析起点、终点和乘车时间。

    表头中的“起点/终点/金额”用来计算列边界；地址换行后仍按所在列
    和距离最近的主行归并。每页独立识别，避免多页 PDF 的相同 y 坐标串行。
    坐标法失败时降级为原文本解析。
    """
    try:
        spans = _extract_pdf_spans(path)
    except Exception:
        spans = []
    if not spans:
        return parse_itinerary_text(_extract_text_fallback(path))

    trips = []
    page_numbers = sorted({page for page, _, _, _ in spans})
    for page_no in page_numbers:
        page_spans = [(x, y, text) for page, x, y, text in spans if page == page_no]
        rows = {}
        for x, y, text in page_spans:
            key = round(y, 1)
            rows.setdefault(key, []).append((x, text))

        header_y = None
        header_items = None
        for y, items in sorted(rows.items()):
            labels = [text for _, text in items]
            if "起点" in labels and "终点" in labels:
                header_y = y
                header_items = sorted(items)
                break
        if header_y is None or not header_items:
            continue

        labels = [text for _, text in header_items]
        xs = [x for x, _ in header_items]
        origin_index = labels.index("起点")
        destination_index = labels.index("终点")
        origin_left = ((xs[origin_index - 1] + xs[origin_index]) / 2
                       if origin_index > 0 else float("-inf"))
        split_x = (xs[origin_index] + xs[destination_index]) / 2
        destination_right = ((xs[destination_index] + xs[destination_index + 1]) / 2
                             if destination_index + 1 < len(xs) else float("inf"))

        main_rows = sorted({round(y, 1) for _, y, text in page_spans
                            if y > header_y and DATE_RE.search(text)})
        for index, main_y in enumerate(main_rows):
            lower = ((main_rows[index - 1] + main_y) / 2
                     if index > 0 else header_y)
            upper = ((main_y + main_rows[index + 1]) / 2
                     if index + 1 < len(main_rows) else float("inf"))
            group = [(x, y, text) for x, y, text in page_spans
                     if lower < y < upper and not AMOUNT_RE.fullmatch(text)]

            date = time = None
            for _, _, text in group:
                if date is None and (match := DATE_RE.search(text)):
                    date = match.group(0)
                if time is None and (match := TIME_RE.search(text)):
                    time = match.group(0)

            origin_parts = sorted((y, x, text) for x, y, text in group
                                  if origin_left <= x < split_x
                                  and not DATE_RE.search(text) and not TIME_RE.search(text))
            destination_parts = sorted((y, x, text) for x, y, text in group
                                       if split_x <= x < destination_right)
            origin = "".join(text for _, _, text in origin_parts).strip() or None
            destination = "".join(text for _, _, text in destination_parts).strip() or None
            if origin is not None or destination is not None:
                trips.append({"from": origin, "to": destination,
                              "date": date, "time": time})

    return trips or parse_itinerary_text(_extract_text_fallback(path))
