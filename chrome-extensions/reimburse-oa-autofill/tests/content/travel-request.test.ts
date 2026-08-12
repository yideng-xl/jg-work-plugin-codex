import { describe, expect, it } from "vitest";
import { chooseNearestPriorCandidate, isTravelRequestRow } from "../../src/content/travel-request";

const row = (date: string) => ({ row: document.createElement("tr"), date });

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
    const result = chooseNearestPriorCandidate("2099-01-10", [row("2099-01-01"), row("2099-01-09"), row("2099-01-10")]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") expect(result.candidate.date).toBe("2099-01-09");
  });
  it("returns missing without an earlier candidate", () => {
    expect(chooseNearestPriorCandidate("2099-01-10", [row("2099-01-10"), row("2099/01/11")]).status).toBe("missing");
  });
  it("returns ambiguous for duplicate nearest dates", () => {
    expect(chooseNearestPriorCandidate("2099-01-10", [row("2099年1月9日"), row("2099-01-09")]).status).toBe("ambiguous");
  });
});
