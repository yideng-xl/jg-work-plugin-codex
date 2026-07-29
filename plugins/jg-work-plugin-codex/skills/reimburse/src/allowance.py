from datetime import date


def _parse_date(s: str) -> date:
    y, m, d = (int(x) for x in s.split("-"))
    return date(y, m, d)


def _before_noon(hhmm: str) -> bool:
    h, m = (int(x) for x in hhmm.split(":"))
    return (h, m) < (12, 0)


def compute_allowance_days(dep_date, dep_time, ret_date, ret_time) -> float:
    d0, d1 = _parse_date(dep_date), _parse_date(ret_date)
    if d0 == d1:
        return 1.0  # 同日往返固化算 1 天
    dep_val = 1.0 if _before_noon(dep_time) else 0.5
    ret_val = 1.0 if not _before_noon(ret_time) else 0.5
    middle = max((d1 - d0).days - 1, 0)
    return dep_val + middle + ret_val
