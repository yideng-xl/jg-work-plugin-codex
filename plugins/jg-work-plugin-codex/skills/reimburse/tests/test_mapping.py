from src.mapping import load_mapping, match_category, append_rule

RULES = [
    {"match": {"kind": "铁路电子客票"}, "category": "差旅费-交通费"},
    {"match": {"seller_contains": "出行"}, "category": "差旅费-交通费"},
    {"match": {"seller_contains": "阿里云"}, "category": "待确认"},
]

def test_match_by_kind():
    t = {"seller": "中国铁路", "invoice_kind": "铁路电子客票"}
    assert match_category(t, RULES) == "差旅费-交通费"

def test_match_by_seller():
    t = {"seller": "曹操出行", "invoice_kind": "普票"}
    assert match_category(t, RULES) == "差旅费-交通费"

def test_no_match():
    t = {"seller": "某不认识的公司", "invoice_kind": "普票"}
    assert match_category(t, RULES) is None

def test_append_and_reload(tmp_path):
    f = tmp_path / "m.yaml"
    f.write_text("rules: []\n", encoding="utf-8")
    append_rule(str(f), "腾讯", "办公费")
    rules = load_mapping(str(f))
    t = {"seller": "腾讯科技", "invoice_kind": "普票"}
    assert match_category(t, rules) == "办公费"
    # 去重：再 append 同条不应重复
    append_rule(str(f), "腾讯", "办公费")
    assert len(load_mapping(str(f))) == 1


def test_match_by_item_contains_real_gaode_case():
    """真实数据案例：高德打车 XML 的 SellerName 是法人实体名（如"苏州市吉利优行电子
    科技有限公司"），seller_contains 关键词（出行/约车/用车）匹配不上。但 ItemName
    含"客运服务"是可靠信号（xml 和裸 PDF 提取文本都含这个公共子串），改用
    item_contains 规则命中，销售方信息无视。"""
    rules = [
        {"match": {"kind": "铁路电子客票"}, "category": "差旅费-交通费"},
        {"match": {"item_contains": "客运服务"}, "category": "差旅费-交通费"},
    ]
    t_xml = {
        "seller": "苏州市吉利优行电子科技有限公司",
        "invoice_kind": "普票",
        "item_name": "*交通运输服务*客运服务费",
    }
    assert match_category(t_xml, rules) == "差旅费-交通费"

    # 裸 PDF：PDF 文本提取缺"交通"前缀，item_name 是 "*运输服务*客运服务费"，
    # 仍含公共子串"客运服务"，同样要命中。
    t_bare_pdf = {
        "seller": "上海及时用车科技有限公司",
        "invoice_kind": "普票",
        "item_name": "*运输服务*客运服务费",
    }
    assert match_category(t_bare_pdf, rules) == "差旅费-交通费"


def test_item_contains_no_match_when_item_name_missing_or_mismatched():
    rules = [{"match": {"item_contains": "客运服务"}, "category": "差旅费-交通费"}]
    t_none = {"seller": "某公司", "invoice_kind": "普票", "item_name": None}
    assert match_category(t_none, rules) is None
    t_missing_key = {"seller": "某公司", "invoice_kind": "普票"}
    assert match_category(t_missing_key, rules) is None
    t_mismatch = {"seller": "某公司", "invoice_kind": "普票", "item_name": "*餐饮服务*"}
    assert match_category(t_mismatch, rules) is None


def test_append_rule_corrects_existing_keyword(tmp_path):
    """回归用例：修正一条已存在关键词的科目，必须在下次匹配中生效。

    背景 bug：append_rule 之前永远把新规则追加到列表末尾，而
    match_category 命中第一条匹配规则就返回。当 mapping.yaml 里已有
    种子规则 {seller_contains: 阿里云, category: 待确认} 时，用户通过
    append_rule("mapping.yaml", "阿里云", "云服务") 做的修正会被追加到
    种子规则之后，match_category 永远先命中种子规则，修正形同虚设。
    """
    f = tmp_path / "m.yaml"
    f.write_text(
        "rules:\n"
        "  - match:\n"
        "      seller_contains: 阿里云\n"
        "    category: 待确认\n",
        encoding="utf-8",
    )

    append_rule(str(f), "阿里云", "云服务")

    rules = load_mapping(str(f))
    t = {"seller": "阿里云计算", "invoice_kind": "普票"}
    assert match_category(t, rules) == "云服务"

    matching = [
        r for r in rules
        if r.get("match", {}).get("seller_contains") == "阿里云"
    ]
    assert len(matching) == 1
