import fitz  # PyMuPDF：show_pdf_page 会正确隔离每张源票的字体/资源，
             # 不像 pypdf 的页面合并那样多张同名字体互相覆盖导致文字丢失。

A4_W, A4_H = 595.0, 842.0


def split_print_specs(tickets: list) -> tuple[list, list]:
    """按打印要求拆分票据，保留各票种原始语义。

    返回 (打印 1 张, 整份打印 2 次)。铁路电子客票与专票采用相同
    打印份数，但铁路票仍是铁路电子客票，不参与专票税额计算。
    """
    one_copy = []
    two_copies = []
    for ticket in tickets:
        spec = {"path": ticket["pdf_path"], "copies": 1}
        if ticket["invoice_kind"] in {"专票", "铁路电子客票"}:
            two_copies.append(spec)
        elif ticket["invoice_kind"] == "普票":
            one_copy.append(spec)
    return one_copy, two_copies


def _expand(pdf_specs):
    seq = []
    for spec in pdf_specs:
        for _ in range(spec.get("copies", 1)):
            seq.append(spec["path"])
    return seq


def _page_size(path):
    with fitz.open(path) as d:
        r = d[0].rect
        return float(r.width), float(r.height)


def _uniform_scale(paths):
    # 全局统一缩放系数：取所有票里"最占地"那张的适配系数。
    # 每张票都用同一个系数，宽度一致、大小统一，不会出现矮票各自撑满
    # 半页导致某张特别大。系数由最高/最宽那张决定，保证它也塞得下。
    scale = None
    for path in paths:
        sw, sh = _page_size(path)
        fit = min(A4_W * 0.92 / sw, (A4_H / 2) * 0.92 / sh)
        scale = fit if scale is None else min(scale, fit)
    return scale


def build_a4(pdf_specs: list, out_path: str):
    invoices = _expand(pdf_specs)
    scale = _uniform_scale(invoices) if invoices else 1.0

    out = fitz.open()
    for i in range(0, len(invoices), 2):
        page = out.new_page(width=A4_W, height=A4_H)
        for slot, path in enumerate(invoices[i:i + 2]):
            sw, sh = _page_size(path)
            new_w, new_h = sw * scale, sh * scale
            x0 = (A4_W - new_w) / 2
            # fitz 坐标系原点在左上、y 向下：slot 0 放上半页，slot 1 放下半页
            if slot == 0:
                y0 = (A4_H / 2 - new_h) / 2
            else:
                y0 = A4_H / 2 + (A4_H / 2 - new_h) / 2
            rect = fitz.Rect(x0, y0, x0 + new_w, y0 + new_h)
            with fitz.open(path) as src:
                page.show_pdf_page(rect, src, 0)
    out.save(out_path)
    out.close()
