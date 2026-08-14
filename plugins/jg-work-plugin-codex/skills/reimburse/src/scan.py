import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from src.parsers.einvoice_xml import parse_einvoice_xml, PREPAID_KEYWORDS
from src.parsers.train_pdf import parse_train_pdf, extract_pdf_text
from src.parsers.filename import parse_gaode_filename
from src.parsers.itinerary_pdf import parse_itinerary_pdf


# skill 自己的产出物名。扫描时排除，否则重跑会把上次生成的
# A4拼贴.pdf 当成一张发票扫进来（它是 PDF），污染票数和统一缩放。
OUTPUT_NAMES = {"A4拼贴.pdf", "报销摘要.xlsx", "交通费明细.xlsx"}
OUTPUT_PREFIXES = ("05-", "09-", "A4")


def build_copies(invoice_kind: str) -> int:
    return 2 if invoice_kind == "专票" else 1


def _group_key(path: Path) -> str:
    stem = path.stem
    for suffix in ("电子发票", "电子行程单"):
        stem = stem.replace(suffix, "")
    return stem.strip()


def scan_folder(folder: str) -> list:
    files = [p for p in Path(folder).rglob("*") if p.is_file()
             and p.suffix.lower() in (".xml", ".pdf", ".ofd")
             and p.name not in OUTPUT_NAMES
             and not p.name.startswith(OUTPUT_PREFIXES)]
    groups = defaultdict(list)
    for p in files:
        groups[_group_key(p)].append(p)

    tickets = []
    for key, paths in sorted(groups.items()):
        by_ext = {p.suffix.lower(): p for p in paths}
        invoice_pdf = next((p for p in paths if p.suffix.lower() == ".pdf"
                            and "行程单" not in p.name), None)
        itinerary_pdf = next((p for p in paths if p.suffix.lower() == ".pdf"
                              and "行程单" in p.name), None)

        t = {
            "file_stem": key, "files": [str(p) for p in paths],
            "source_type": "other", "seller": None, "invoice_kind": "unknown",
            "copies": 1, "date": None, "amount": None, "tax": None,
            "item_name": None, "trips": [], "trip_count": None,
            "is_prepaid": False, "depart_time": None, "train_no": None,
            "pdf_path": str(invoice_pdf) if invoice_pdf else None,
        }

        # 1) xml 优先
        if ".xml" in by_ext:
            x = parse_einvoice_xml(by_ext[".xml"].read_text(encoding="utf-8"))
            t.update(source_type="einvoice_xml", seller=x["seller"],
                     invoice_kind=x["invoice_kind"], amount=x["amount"],
                     tax=x["tax"], date=x["date"], item_name=x["item_name"],
                     is_prepaid=x["is_prepaid"])
        # 2) 无 xml，看 pdf 是否火车票
        elif invoice_pdf is not None:
            text = extract_pdf_text(str(invoice_pdf))
            tr = parse_train_pdf(str(invoice_pdf), text=text)
            if tr.get("is_train"):
                t.update(source_type="train_pdf", seller=tr["seller"],
                         invoice_kind=tr["invoice_kind"], amount=tr["amount"],
                         tax=tr["tax"], date=tr["date"],
                         trips=[{"from": tr["from_"], "to": tr["to"]}],
                         depart_time=tr.get("depart_time"),
                         train_no=tr.get("train_no"))
            else:
                t["source_type"] = "bare_pdf"
                item_m = re.search(r"\*[^*\n]+\*[^\s\d]+费", text)
                if item_m:
                    t["item_name"] = item_m.group(0)
                if any(k in text for k in PREPAID_KEYWORDS):
                    t["is_prepaid"] = True

        # 3) 文件名补平台/金额/行程数
        fn = parse_gaode_filename(key) or (
            parse_gaode_filename(invoice_pdf.name) if invoice_pdf else None)
        if fn:
            t["trip_count"] = fn["trip_count"]
            if t["seller"] is None:
                t["seller"] = fn["platform"]
            if t["amount"] is None:
                t["amount"] = fn["amount"]

        # 4) 行程单补起止地和实际乘车日期/时间
        if itinerary_pdf is not None:
            t["trips"] = parse_itinerary_pdf(str(itinerary_pdf))
            if t["trips"]:
                t["ride_date"] = t["trips"][0].get("date")
                t["ride_time"] = t["trips"][0].get("time")

        t["copies"] = build_copies(t["invoice_kind"])
        tickets.append(t)

    return tickets


if __name__ == "__main__":
    print(json.dumps(scan_folder(sys.argv[1]), ensure_ascii=False, indent=2))
