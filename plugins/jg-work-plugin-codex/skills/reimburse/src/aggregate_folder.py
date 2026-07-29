"""把一个报销文件夹（票堆，任意 1~2 级嵌套）汇聚成报销费用明细的核心。

一簦的目录约定：顶层=场景（出差/其他）→ 时间层（报销日期文件夹）→ 票堆文件夹，
票堆里再按费用分类分子文件夹（如 差旅费-交通费/、差旅-住宿费/）。所以：
- **子文件夹名 = 费用分类**，直接读路径当科目，比按发票内容猜准得多。
- 平铺没分子文件夹的票，category 返回 None，交给 Claude 按内容推荐+标黄+用户 check。

两类明细别弄混：
- 交通费报销明细表（附件）**只放打车**；高铁/飞机不进（发票直接进 A4），
  但按费用分类汇总时，打车+高铁+飞机都算进「差旅费-交通费」大类。
- OA 报销费用明细按费用分类聚合（一类一行），普票税额写 0。
"""
from pathlib import Path

from src.scan import scan_folder
from src.oa_forms import aggregate_by_category
from src.parsers.filename import parse_gaode_filename

TAXI_REASON_DEFAULT = "无直达交通"      # 一簦打车原因的惯用默认，预填省得每张手写


def category_of(ticket: dict, folder: str):
    """费用分类 = 票（相对 folder）所在的第一层子文件夹名；平铺无子文件夹返回 None。"""
    root = Path(folder)
    for f in ticket["files"]:
        rel = Path(f).relative_to(root)
        if len(rel.parts) >= 2:
            return rel.parts[0]
    return None


def is_ride_hailing(ticket: dict) -> bool:
    """打车票（进交通费明细表的唯一票种）：品名含"客运服务"或高德类文件名，
    且不是铁路。高铁/飞机一律不算打车。"""
    if ticket["invoice_kind"] == "铁路电子客票":
        return False
    if ticket.get("item_name") and "客运服务" in ticket["item_name"]:
        return True
    return parse_gaode_filename(ticket["file_stem"]) is not None


def _trip_end(ticket, key):
    trips = ticket.get("trips") or []
    return trips[0].get(key) if trips else None


def summarize_folder(folder: str) -> dict:
    """扫文件夹 → 汇聚。返回：
    - tickets：原始扫描结果（含 pdf_path/copies，供 A4 拼贴用）
    - items：逐票、已打 category（子文件夹名）的可报销票（有金额的），供 OA 明细聚合
    - by_category：按费用分类聚合后的行（一类一行，供核对/展示；普票税额=0）
    - taxi_detail：打车明细表的行（仅打车；金额来自发票，打车原因预填默认，
      日期/起止地留空待用户补）
    - unparsed：可报销但没解析出金额的票（如住宿发票待解析），需用户补充
    过滤：预充值（is_prepaid）、酒店水单（is_slip）不计入。
    """
    tickets = scan_folder(folder)
    reimbursable = [t for t in tickets
                    if not t.get("is_prepaid") and not t.get("is_slip")]
    for t in reimbursable:
        t["_category"] = category_of(t, folder)

    parsed = [t for t in reimbursable if t["amount"] is not None]
    unparsed = [t for t in reimbursable if t["amount"] is None]

    items = [{"category": t["_category"], "amount": t["amount"],
              "tax": t["tax"], "legs": "", "date": t["date"]} for t in parsed]
    by_category = aggregate_by_category(items)

    taxi_detail = [{"date": None, "from_": _trip_end(t, "from"),
                    "to": _trip_end(t, "to"), "amount": t["amount"],
                    "reason": TAXI_REASON_DEFAULT}
                   for t in parsed if is_ride_hailing(t)]

    return {"tickets": tickets, "items": items, "by_category": by_category,
            "taxi_detail": taxi_detail, "unparsed": unparsed}
