import { describe, expect, it, vi } from "vitest";
import "../src/main-world/index";

describe("OA main-world bridge", () => {
  it("writes fields through WfForm.changeFieldValue", async () => {
    const changeFieldValue = vi.fn();
    Object.assign(window, { WfForm: { changeFieldValue } });
    const response = new Promise<MessageEvent>((resolve) => {
      const receive = (event: MessageEvent) => {
        if (event.data?.source !== "jg-reimburse-oa-autofill-result") return;
        window.removeEventListener("message", receive);
        resolve(event);
      };
      window.addEventListener("message", receive);
    });

    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: {
        source: "jg-reimburse-oa-autofill",
        requestId: "request-1",
        fieldId: "field9749_0",
        value: "甲地",
      },
    }));

    expect(changeFieldValue).toHaveBeenCalledWith("field9749_0", { value: "甲地" });
    expect((await response).data).toMatchObject({ requestId: "request-1", ok: true });
  });
});
