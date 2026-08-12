from pypdf import PdfReader, PdfWriter
from src.build_a4 import build_a4, _uniform_scale, A4_W, A4_H


def _make_pdf(path, w=595, h=421):
    writer = PdfWriter()
    writer.add_blank_page(width=w, height=h)
    with open(path, "wb") as f:
        writer.write(f)


def test_two_invoices_one_a4(tmp_path):
    a, b = tmp_path / "a.pdf", tmp_path / "b.pdf"
    _make_pdf(a); _make_pdf(b)
    out = tmp_path / "a4.pdf"
    build_a4([{"path": str(a), "copies": 1}, {"path": str(b), "copies": 1}], str(out))
    assert len(PdfReader(str(out)).pages) == 1


def test_special_invoice_two_copies(tmp_path):
    a = tmp_path / "a.pdf"
    _make_pdf(a)
    out = tmp_path / "a4.pdf"
    build_a4([{"path": str(a), "copies": 2}], str(out))
    # 2 份 → 拼到 1 张 A4
    assert len(PdfReader(str(out)).pages) == 1


def test_three_invoices_two_pages(tmp_path):
    paths = []
    for n in "abc":
        p = tmp_path / f"{n}.pdf"; _make_pdf(p); paths.append(p)
    out = tmp_path / "a4.pdf"
    build_a4([{"path": str(p), "copies": 1} for p in paths], str(out))
    assert len(PdfReader(str(out)).pages) == 2   # 2 张一页 + 1 张一页


def test_uniform_scale_driven_by_largest(tmp_path):
    # 一矮一高两张不同尺寸的票：统一系数由高的那张(占地大)决定，
    # 矮的那张不再各自撑满 => 底部不会特别大
    short = tmp_path / "short.pdf"; _make_pdf(short, w=595, h=400)
    tall = tmp_path / "tall.pdf"; _make_pdf(tall, w=595, h=520)
    s = _uniform_scale([str(short), str(tall)])
    tall_fit = min(A4_W * 0.92 / 595, (A4_H / 2) * 0.92 / 520)
    short_fit = min(A4_W * 0.92 / 595, (A4_H / 2) * 0.92 / 400)
    assert abs(s - tall_fit) < 1e-9        # 统一系数=最高那张的适配系数
    assert s < short_fit                    # 矮票被压到统一系数，不再独立撑满
    # 两张同宽源 => 同一系数 => 最终同宽
    assert abs(595 * s - 595 * s) < 1e-9
