from src.parsers.einvoice_xml import parse_einvoice_xml

SAMPLE = """<?xml version="1.0" encoding="utf-8"?>
<EInvoice><Header><InherentLabel>
  <GeneralOrSpecialVAT><LabelCode>02</LabelCode><LabelName>普通发票</LabelName></GeneralOrSpecialVAT>
</InherentLabel></Header>
<EInvoiceData>
  <SellerInformation><SellerName>苏州市吉利优行电子科技有限公司</SellerName></SellerInformation>
  <BasicInformation>
    <TotalTaxAm>5.41</TotalTaxAm>
    <TotalTax-includedAmount>185.82</TotalTax-includedAmount>
    <RequestTime>2026-07-08 16:18:05</RequestTime>
  </BasicInformation>
  <IssuItemInformation><ItemName>*交通运输服务*客运服务费</ItemName></IssuItemInformation>
</EInvoiceData></EInvoice>"""

def test_parse_normal_invoice():
    r = parse_einvoice_xml(SAMPLE)
    assert r["seller"] == "苏州市吉利优行电子科技有限公司"
    assert r["invoice_kind"] == "普票"
    assert r["amount"] == 185.82
    assert r["tax"] == 5.41
    assert r["date"] == "2026-07-08"
    assert r["is_prepaid"] is False

def test_prepaid_detected():
    xml = SAMPLE.replace("*交通运输服务*客运服务费", "*预付卡*充值")
    r = parse_einvoice_xml(xml)
    assert r["is_prepaid"] is True

def test_special_invoice_kind():
    xml = SAMPLE.replace("<LabelCode>02</LabelCode>", "<LabelCode>01</LabelCode>")
    r = parse_einvoice_xml(xml)
    assert r["invoice_kind"] == "专票"
