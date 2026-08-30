import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../../src/excel/parse-workbook";
import { validateWorkbook } from "../../src/excel/validate-workbook";
import { makeTravelWorkbook } from "../fixtures/workbooks";

describe("validateWorkbook", () => {
  it("accepts a valid travel workbook without OA-owned header warnings", () => {
    const issues = validateWorkbook(parseWorkbook(makeTravelWorkbook()));

    expect(issues).toEqual([]);
  });

  it("rejects inconsistent money", () => {
    const data = parseWorkbook(makeTravelWorkbook());
    data.expenses[0].expenseAmount = 100;
    data.expenses[1].taxAmount = 2000;

    const issues = validateWorkbook(data);

    expect(issues.some((issue) => issue.field === "费用明细第 1 行" && issue.level === "error")).toBe(true);
    expect(issues.some((issue) => issue.field === "费用明细第 2 行" && issue.level === "error")).toBe(true);
    expect(issues.some((issue) => issue.field === "增值税专票税额合计" && issue.level === "error")).toBe(true);
  });
});
