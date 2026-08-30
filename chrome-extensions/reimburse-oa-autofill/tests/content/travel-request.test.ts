import { describe, expect, it } from "vitest";
import {
  chooseNearestPriorCandidate,
  isTravelRequestRow,
  travelRequestCandidateFromRow,
  type TravelRequestCandidate,
} from "../../src/content/travel-request";

const row = (date: string, applicant = "测试用户"): TravelRequestCandidate => ({
  row: document.createElement("tr"),
  date,
  applicant,
  selection: { applicationDate: date, applicant, details: [] },
});

describe("chooseNearestPriorCandidate", () => {
  it("waits for real CCSQ candidate rows instead of underlying form dates", () => {
    const formRow = document.createElement("tr");
    formRow.innerHTML = "<td>填报日期</td><td>2099-01-15</td>";
    const requestRow = document.createElement("tr");
    requestRow.innerHTML = '<td stsdata="CCSQ209901010001">CCSQ209901010001</td><td>2099-01-01</td>';
    expect(isTravelRequestRow(formRow)).toBe(false);
    expect(isTravelRequestRow(requestRow)).toBe(true);
  });
  it("selects the unique nearest date strictly before departure", () => {
    const result = chooseNearestPriorCandidate("2099-01-10", "测试用户", [row("2099-01-01"), row("2099-01-09"), row("2099-01-10")]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") expect(result.candidate.date).toBe("2099-01-09");
  });
  it("returns missing without an earlier candidate", () => {
    expect(chooseNearestPriorCandidate("2099-01-10", "测试用户", [row("2099-01-10"), row("2099/01/11")]).status).toBe("missing");
  });
  it("returns ambiguous for duplicate nearest dates", () => {
    expect(chooseNearestPriorCandidate("2099-01-10", "测试用户", [row("2099年1月9日"), row("2099-01-09")]).status).toBe("ambiguous");
  });
  it("filters candidates by the current OA applicant before comparing dates", () => {
    const result = chooseNearestPriorCandidate("2099-01-10", "测试用户", [
      row("2099-01-09", "其他用户"),
      row("2099-01-08", "测试用户"),
    ]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") expect(result.candidate.date).toBe("2099-01-08");
    expect(chooseNearestPriorCandidate("2099-01-10", "测试用户", [row("2099-01-09", "其他用户")]).status)
      .toBe("applicant-missing");
  });
  it("captures all columns from the selected travel-request row", () => {
    const table = document.createElement("table");
    table.innerHTML = `<tr><th>申请记录</th><th>申请日期</th><th>申请人</th><th>出差事由</th></tr>
      <tr><td stsdata="CCSQ209901010001">CCSQ209901010001</td><td>2099-01-08</td><td>测试用户</td><td>项目交流</td></tr>`;
    const candidate = travelRequestCandidateFromRow(table.rows[1]);
    expect(candidate?.applicant).toBe("测试用户");
    expect(candidate?.selection.code).toBe("CCSQ209901010001");
    expect(candidate?.selection.details).toContainEqual({ label: "出差事由", value: "项目交流" });
  });
});
