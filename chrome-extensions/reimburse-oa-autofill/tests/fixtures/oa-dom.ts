export function makeOaDocument(options: {
  kind?: "travel" | "general";
  requestNumber?: string;
  tripValue?: string;
  expenseValue?: string;
  includeTables?: boolean;
} = {}): Document {
  const {
    kind = "travel",
    requestNumber = "JSBX202600000001",
    tripValue = "",
    expenseValue = "",
    includeTables = true,
  } = options;
  const typeText = kind === "travel" ? "差旅" : "通用";
  const detail = includeTables ? `
    <section><h2>行程明细</h2><table id="oTable0"><tbody>
      <tr class="data-row"><td>1</td><td><input id="field9760_0" value="${tripValue}"></td><td><input id="field9761_0"></td></tr>
    </tbody></table></section>
    <section><h2>报销费用明细</h2><table id="oTable1"><tbody>
      <tr class="data-row"><td>1</td><td><input id="field9758_0" type="hidden"><input id="field15378_0" type="hidden" value="28"></td><td><input id="field9755_0" value="${expenseValue}"></td></tr>
      <tr class="total"><td>合计</td><td>0.00</td></tr>
    </tbody></table></section>` : "";
  const html = `<!doctype html><html><body>
    <div>流程:处理 - 技术报销</div>
    <table>
      <tr><td>报销单号</td><td>${requestNumber}</td></tr>
      <tr><td>标题</td><td>测试报销</td><td><input id="requestname" value="测试报销"><input id="field9766" value="${requestNumber}"></td></tr>
      <tr><td>申请人</td><td>测试用户</td><td><input id="field9768" value="测试用户"></td></tr>
      <tr><td>填报日期</td><td>2099-01-15</td><td><input id="field9767" value="2099-01-15"></td></tr>
      <tr><td>费用大区</td><td>测试大区</td><td><input id="field9770" value="测试大区"></td></tr>
      <tr><td>费用部门</td><td>测试部门</td><td><input id="field9769" value="测试部门"></td></tr>
      <tr><td>报销类型</td><td>${typeText}</td><td><input id="field9772" value="${typeText}"></td></tr>
      <tr><td>费用地区</td><td>测试地区</td><td><input id="field9771" value="测试地区"></td></tr>
      <tr><td>报销分类</td><td><input id="field9773"></td></tr>
      <tr><td>销售合同</td><td><input id="field10236"></td></tr>
      <tr><td>报销事由</td><td>测试出差<input id="field9778" type="hidden" value="测试出差"></td></tr>
      <tr><td>出差天数</td><td><input id="field10238"></td></tr>
      <tr><td>实际工作天数</td><td><input id="field10239"></td></tr>
      <tr><td>费用合计</td><td><input id="field9779" value="0.00"></td></tr>
      <tr><td>增值税专票税额合计</td><td><input id="field9780" value="0.00"></td></tr>
      <tr><td>报销总金额</td><td><input id="field9781" value="0.00"></td></tr>
      <tr><td>出差申请记录</td><td><input id="field13685"></td></tr>
      <tr><td>报销付款日期</td><td><input id="field9782"></td></tr>
    </table>
    ${detail}
  </body></html>`;
  return new DOMParser().parseFromString(html, "text/html");
}
