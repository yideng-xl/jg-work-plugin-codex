import { expect, it } from "vitest";
import { readPlannedTrips } from "../../src/content/travel-plan";
import { travelRequestSentence } from "../../src/popup/index";

it("uses all planned rows instead of actual trip details", () => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<table id="oTable1"><tr><td></td><td>序号</td><td>出发日期</td><td>出发地</td><td>回程日期</td><td>目的地</td><td>事由</td></tr>
    <tr><td></td><td>1</td><td>2099-01-07</td><td>甲地</td><td>2099-01-09</td><td>乙地</td><td>项目交流</td></tr>
    <tr><td></td><td>2</td><td>2099-01-10</td><td>乙地</td><td>2099-01-11</td><td>丙地</td><td>现场检查</td></tr></table>
    <table id="oTable2"><tr><td>实际行程不得混入</td></tr></table>`;
  const plannedTrips = readPlannedTrips(doc);
  expect(plannedTrips).toHaveLength(2);
  const text = travelRequestSentence({code:"CCSQ1",applicationDate:"2099-01-04",applicant:"测试用户",details:[],plannedTrips});
  expect(text).toBe("申请记录编号【CCSQ1】\n申请日期【2099-01-04】\n申请人【测试用户】\n行程1 计划于【2099-01-07】从【甲地】前往【乙地】，于【2099-01-09】返回，事由为【项目交流】。\n行程2 计划于【2099-01-10】从【乙地】前往【丙地】，于【2099-01-11】返回，事由为【现场检查】。");
});
