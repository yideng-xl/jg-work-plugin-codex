import re

GAODE_RE = re.compile(r"【(.+?)-([\d.]+)元-(\d+)个行程】")


def parse_gaode_filename(name: str):
    m = GAODE_RE.search(name)
    if not m:
        return None
    return {
        "platform": m.group(1),
        "amount": float(m.group(2)),
        "trip_count": int(m.group(3)),
    }
