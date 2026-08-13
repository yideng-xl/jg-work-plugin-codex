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
