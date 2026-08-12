import { describe, expect, it } from "vitest";
import { handleExtensionMessage } from "../../src/content/index";
import { makeOaDocument } from "../fixtures/oa-dom";

describe("handleExtensionMessage", () => {
  it("returns the current page inspection", async () => {
    const result = await handleExtensionMessage({ type: "INSPECT_PAGE" }, makeOaDocument());
    expect(result).toMatchObject({ supported: true, kind: "travel" });
  });
});
