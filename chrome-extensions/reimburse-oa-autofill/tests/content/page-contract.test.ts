import { describe, expect, it } from "vitest";
import { inspectPage } from "../../src/content/page-contract";
import { makeOaDocument } from "../fixtures/oa-dom";

describe("inspectPage", () => {
  it("accepts a full travel processing page", () => {
    expect(inspectPage(makeOaDocument())).toMatchObject({
      supported: true,
      kind: "travel",
      requestNumber: "JSBX202600000001",
      tripHasData: false,
      expenseHasData: false,
    });
  });

  it("rejects the create page without detail tables and request number", () => {
    expect(inspectPage(makeOaDocument({ requestNumber: "", includeTables: false }))).toMatchObject({
      supported: false,
    });
  });

  it("detects existing trip and expense data independently", () => {
    expect(inspectPage(makeOaDocument({ tripValue: "2099-01-10" }))).toMatchObject({
      tripHasData: true,
      expenseHasData: false,
    });
    expect(inspectPage(makeOaDocument({ expenseValue: "100.00" }))).toMatchObject({
      tripHasData: false,
      expenseHasData: true,
    });
  });

  it("recognizes a general processing page", () => {
    expect(inspectPage(makeOaDocument({ kind: "general" }))).toMatchObject({
      supported: true,
      kind: "general",
    });
  });
});
