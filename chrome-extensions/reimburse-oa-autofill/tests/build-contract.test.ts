import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manifest", () => {
  it("only runs on the OA host and exposes no storage permission", () => {
    const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab"]);
    expect(manifest.host_permissions).toEqual(["https://oa.jugeng.com:8445/*"]);
    expect(manifest.action.default_popup).toBe("popup/index.html");
    expect(manifest.content_scripts[0]).toMatchObject({
      js: ["main-world.js"],
      world: "MAIN",
      run_at: "document_start",
    });
  });
});
