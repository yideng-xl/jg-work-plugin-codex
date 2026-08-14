import re

STATION_RE = re.compile(r"([一-龥]+)\s*站")
# 票价：两版铁路电子客票版式不同——一版"票价:￥151.00"连着，另一版"票价:"
# 与"￥446.00"中间隔了座别/身份证号等一堆字符。用 [\s\S]*? 从"票价"惰性找到
# 其后第一个 ￥金额（锚在 ￥ 上，跳过中间的身份证号等无关数字）。
PRICE_RE = re.compile(r"票价\s*[:：]?[\s\S]*?[￥¥]\s*(\d+\.\d{2})")
RIDE_DATE_RE = re.compile(r"(\d{4})\s*年\s*(\d{2})\s*月\s*(\d{2})\s*日")
# 开票日期，用来把它从候选乘车日期里排除（有的版式开票日排在乘车日前面）
INVOICE_DATE_RE = re.compile(r"开票日期\s*[:：]?\s*\d{4}\s*年\s*\d{2}\s*月\s*\d{2}\s*日")
DEPART_TIME_RE = re.compile(r"(\d{2}:\d{2})\s*开")
TRAIN_NO_RE = re.compile(r"\b([GDCZTK]\d{1,4})\b", re.IGNORECASE)


def parse_train_text(text: str) -> dict:
    is_train = "铁路电子客票" in text
    if not is_train:
        return {"is_train": False}

    stations = STATION_RE.findall(text)
    price = PRICE_RE.search(text)
    depart = DEPART_TIME_RE.search(text)
    train_no = TRAIN_NO_RE.search(text)

    # 乘车日期：跳过"开票日期"那一处，取第一个真正的日期
    inv = INVOICE_DATE_RE.search(text)
    inv_span = inv.span() if inv else None
    ride_date = None
    for m in RIDE_DATE_RE.finditer(text):
        if inv_span and inv_span[0] <= m.start() < inv_span[1]:
            continue                        # 这是开票日期，不是乘车日期
        ride_date = m
        break

    date = None
    if ride_date:
        date = f"{ride_date.group(1)}-{ride_date.group(2)}-{ride_date.group(3)}"

    # 版式：先出现到达站，再出现始发站
    to = stations[0] if len(stations) >= 1 else None
    from_ = stations[1] if len(stations) >= 2 else None

    return {
        "is_train": True,
        "seller": "中国铁路",
        "invoice_kind": "铁路电子客票",
        "amount": float(price.group(1)) if price else None,
        "tax": None,
        "date": date,
        "depart_time": depart.group(1) if depart else None,
        "train_no": train_no.group(1).upper() if train_no else None,
        "from_": from_,
        "to": to,
    }


def extract_pdf_text(path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(path)
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def _stations_by_x(path: str) -> list[tuple[str, float]]:
    """按票面坐标提取同一视觉行内的站名。

    铁路电子客票的左侧是出发站，右侧是到达站。只在同一页、同一
    视觉行内选取站名，避免把页面其他位置的“站”误当成行程。
    """
    import fitz

    candidates = []
    with fitz.open(path) as doc:
        for page_no, page in enumerate(doc):
            data = page.get_text("dict")
            visual_lines = {}
            for block in data.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        # 同一视觉行可能被 PDF 分成多个 block，按 y 容差重组。
                        y_key = round(span["bbox"][1] / 3) * 3
                        visual_lines.setdefault(y_key, []).append(span)
            for y0, spans in visual_lines.items():
                spans.sort(key=lambda s: s["bbox"][0])
                found = []
                for span in spans:
                    for match in STATION_RE.finditer(span["text"]):
                        found.append((match.group(1), span["bbox"][0]))
                if len(found) >= 2:
                    candidates.append((page_no, y0, found))
    if not candidates:
        return []
    _, _, stations = min(candidates, key=lambda item: (item[0], item[1]))
    return sorted(stations, key=lambda item: item[1])[:2]


def parse_train_pdf(path: str, text: str | None = None) -> dict:
    """解析铁路电子客票：文本法取金额、日期和车次，坐标法确认方向。

    坐标提取失败时保留文本法结果，让上层继续按公开时刻表校验。
    """
    result = parse_train_text(text if text is not None else extract_pdf_text(path))
    if not result.get("is_train"):
        return result
    try:
        stations = _stations_by_x(path)
    except Exception:
        stations = []
    if len(stations) >= 2:
        result["from_"] = stations[0][0]
        result["to"] = stations[1][0]
    return result
