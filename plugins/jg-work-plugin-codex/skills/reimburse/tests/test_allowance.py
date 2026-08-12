from src.allowance import compute_allowance_days


def test_same_day_roundtrip():
    # 2026-06-09 08:12 去，15:50 回 → 固化算 1 天
    assert compute_allowance_days("2026-06-09", "08:12", "2026-06-09", "15:50") == 1.0


def test_two_days_morning_out_afternoon_back():
    # 第一天 12 点前出发(1) + 第二天 12 点后返回(1) = 2
    assert compute_allowance_days("2026-06-09", "08:12", "2026-06-10", "15:50") == 2.0


def test_afternoon_out_morning_back():
    # 12 点后出发(0.5) + 12 点前返回(0.5) = 1
    assert compute_allowance_days("2026-06-09", "14:00", "2026-06-10", "09:00") == 1.0


def test_three_days_with_middle():
    # 12 点前出发(1) + 中间整天(1) + 12 点后返回(1) = 3
    assert compute_allowance_days("2026-06-09", "08:00", "2026-06-11", "18:00") == 3.0


def test_noon_departure_counts_as_after_noon():
    # 出发正好 12:00 → 计 0.5 天；次日 15:50 返回(12点后) → 1.0 天；合计 1.5
    assert compute_allowance_days("2026-06-09", "12:00", "2026-06-10", "15:50") == 1.5


def test_noon_return_counts_as_after_noon():
    # 08:00 出发(12点前) → 1.0 天；次日正好 12:00 返回 → 计 1.0 天；合计 2.0
    assert compute_allowance_days("2026-06-09", "08:00", "2026-06-10", "12:00") == 2.0
