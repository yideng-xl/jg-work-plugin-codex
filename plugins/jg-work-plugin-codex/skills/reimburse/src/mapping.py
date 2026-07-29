import yaml


def load_mapping(path: str) -> list:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("rules", [])


def match_category(ticket: dict, rules: list):
    seller = ticket.get("seller") or ""
    kind = ticket.get("invoice_kind") or ""
    item_name = ticket.get("item_name") or ""
    for rule in rules:
        m = rule.get("match", {})
        if "kind" in m and m["kind"] == kind:
            return rule["category"]
        if "seller_contains" in m and m["seller_contains"] in seller:
            return rule["category"]
        if "item_contains" in m and m["item_contains"] in item_name:
            return rule["category"]
    return None


def append_rule(path: str, keyword: str, category: str):
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {"rules": []}
    rules = data.setdefault("rules", [])
    # Upsert by keyword: if a rule already matches this exact
    # seller_contains keyword, update its category in place so a
    # correction takes effect (match_category returns on first hit,
    # so appending a duplicate keyword after an earlier rule would be
    # dead on arrival). Only brand-new keywords get appended.
    for rule in rules:
        if rule.get("match") == {"seller_contains": keyword}:
            rule["category"] = category
            break
    else:
        rules.append({"match": {"seller_contains": keyword}, "category": category})
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
