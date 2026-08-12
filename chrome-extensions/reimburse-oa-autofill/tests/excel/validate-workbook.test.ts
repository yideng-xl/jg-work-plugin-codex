import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../../src/excel/parse-workbook";
import { validateWorkbook } from "../../src/excel/validate-workbook";
import { makeTravelWorkbook } from "../fixtures/workbooks";

describe("validateWorkbook", () => {
  it("accepts the valid travel workbook with optional-field warnings", () => {
    const issues = validateWorkbook(parseWorkbook(makeTravelWorkbook()));

    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(issues).toContainEqual({
      level: "warning",
      field: "报销分类",
      message: "Excel 未提供，插件将保留 OA 当前值",
    });
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
