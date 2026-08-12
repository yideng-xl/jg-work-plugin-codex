import { afterEach, describe, expect, it, vi } from "vitest";
import { setControlledValue } from "../../src/content/dom-events";

describe("setControlledValue", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "execCommand");
    document.body.replaceChildren();
  });

  it("uses the native setter and dispatches input, change, then blur", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const events: string[] = [];
    let inputWasInputEvent = false;
    for (const name of ["input", "change", "blur"]) {
      input.addEventListener(name, (event) => {
        if (event.type !== "blur") expect(event.bubbles).toBe(true);
        if (event.type === "input") inputWasInputEvent = event instanceof InputEvent;
        events.push(event.type);
      });
    }

    setControlledValue(input, "123.45");

    expect(input.value).toBe("123.45");
    expect(events).toEqual(["input", "change", "blur"]);
    expect(inputWasInputEvent).toBe(true);
  });

  it("supports textarea controls", () => {
    const textarea = document.createElement("textarea");
    setControlledValue(textarea, "费用备注");
    expect(textarea.value).toBe("费用备注");
  });

  it("uses the browser editing command when available", () => {
    const input = document.createElement("input");
    input.value = "旧值";
    document.body.append(input);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn((_command: string, _showUi: boolean, value: string) => {
        input.value = value;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
        return true;
      }),
    });

    setControlledValue(input, "新值");

    expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "新值");
    expect(input.value).toBe("新值");
  });

  it("falls back when the browser editing command reports success without changing the value", () => {
    const input = document.createElement("input");
    document.body.append(input);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });

    setControlledValue(input, "甲地");

    expect(input.value).toBe("甲地");
  });
});
