import xml.etree.ElementTree as ET

PREPAID_KEYWORDS = ("预付卡", "充值", "预充值")


def _text(root, tag):
    el = root.find(f".//{tag}")
    return el.text.strip() if el is not None and el.text else None


def parse_einvoice_xml(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)

    kind_code = None
    gsv = root.find(".//GeneralOrSpecialVAT/LabelCode")
    if gsv is not None and gsv.text:
        kind_code = gsv.text.strip()
    invoice_kind = {"02": "普票", "01": "专票"}.get(kind_code, "unknown")

    amount = _text(root, "TotalTax-includedAmount")
    tax = _text(root, "TotalTaxAm")
    request_time = _text(root, "RequestTime")
    item_name = _text(root, "ItemName")

    return {
        "seller": _text(root, "SellerName"),
        "invoice_kind": invoice_kind,
        "amount": float(amount) if amount else None,
        "tax": float(tax) if tax else None,
        "date": request_time.split(" ")[0] if request_time else None,
        "item_name": item_name,
        "is_prepaid": bool(item_name and any(k in item_name for k in PREPAID_KEYWORDS)),
    }
