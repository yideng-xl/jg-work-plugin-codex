import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../../src/excel/parse-workbook";
import { makeGeneralWorkbook, makeTravelWorkbook } from "../fixtures/workbooks";

describe("parseWorkbook", () => {
  it("parses the travel final workbook", () => {
    const result = parseWorkbook(makeTravelWorkbook());

    expect(result.kind).toBe("travel");
    expect(result.header).toMatchObject({
      applicant: "测试用户",
      workDays: 3,
      reimbursementTotal: 950,
    });
    expect(result.trips).toHaveLength(2);
    expect(result.trips[0]).toEqual({
      departureDate: "2099-01-10",
      departureTime: "08:00",
      from: "甲地",
      arrivalDate: "2099-01-10",
      arrivalTime: "10:00",
      to: "乙地",
      lodgingDays: 2,
    });
    expect(result.expenses).toHaveLength(3);
    expect(result.expenses[0]).toMatchObject({
      category: "差旅费-交通费",
      tripRefs: "12",
      reimbursementAmount: 400,
    });
  });

  it("parses the general final workbook", () => {
    const result = parseWorkbook(makeGeneralWorkbook());

    expect(result.kind).toBe("general");
    expect(result.trips).toEqual([]);
    expect(result.expenses).toEqual([
      {
        category: "物业费",
        incurredDate: "2099-01-10",
        reimbursementAmount: 120,
        taxAmount: 0,
        expenseAmount: 120,
        note: "测试备注",
      },
    ]);
  });
});
