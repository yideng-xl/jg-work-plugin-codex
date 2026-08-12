import { describe, expect, it } from "vitest";
import { fieldValueMatches } from "../../src/content/oa-field-api";

describe("fieldValueMatches", () => {
  it("accepts OA numeric formatting", () => {
    expect(fieldValueMatches("0.00", "0")).toBe(true);
    expect(fieldValueMatches("1,200.00", "1200")).toBe(true);
  });

  it("keeps text comparisons exact", () => {
    expect(fieldValueMatches("甲地", "甲地")).toBe(true);
    expect(fieldValueMatches("甲地区", "甲地")).toBe(false);
  });
});
