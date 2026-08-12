const REQUEST_SOURCE = "jg-reimburse-oa-autofill";
const RESPONSE_SOURCE = "jg-reimburse-oa-autofill-result";

type WfWindow = Window & typeof globalThis & {
  WfForm?: { changeFieldValue(fieldId: string, data: { value: string }): void };
};

export function installMainWorldBridge(win: WfWindow = window as WfWindow): void {
  win.addEventListener("message", (event) => {
    if (event.source !== win || event.data?.source !== REQUEST_SOURCE) return;
    const { requestId, fieldId, value } = event.data;
    try {
      if (typeof win.WfForm?.changeFieldValue !== "function") throw new Error("OA 字段接口尚未就绪。");
      win.WfForm.changeFieldValue(fieldId, { value });
      win.postMessage({ source: RESPONSE_SOURCE, requestId, ok: true }, "*");
    } catch (error) {
      win.postMessage({
        source: RESPONSE_SOURCE,
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, "*");
    }
  });
}

installMainWorldBridge();
