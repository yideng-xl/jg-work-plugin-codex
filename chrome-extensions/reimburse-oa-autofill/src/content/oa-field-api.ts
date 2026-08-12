import { setControlledValue } from "./dom-events";

const REQUEST_SOURCE = "jg-reimburse-oa-autofill";
const RESPONSE_SOURCE = "jg-reimburse-oa-autofill-result";

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

export function fieldValueMatches(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  if (!actual.trim() || !expected.trim()) return false;
  const actualNumber = Number(actual.replace(/,/g, ""));
  const expectedNumber = Number(expected.replace(/,/g, ""));
  return Number.isFinite(actualNumber)
    && Number.isFinite(expectedNumber)
    && Math.abs(actualNumber - expectedNumber) <= 0.000001;
}

function findField(doc: Document, id: string): FieldElement {
  const field = doc.getElementById(id);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    throw new Error(`未找到 OA 字段 ${id}。`);
  }
  return field;
}

async function waitForValue(field: FieldElement, value: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (fieldValueMatches(field.value, value)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`OA 字段 ${field.id} 未保留‘${value}’。`);
}

export async function setOaFieldValue(doc: Document, id: string, value: string): Promise<void> {
  const field = findField(doc, id);
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    setControlledValue(field, value);
    await waitForValue(field, value);
    return;
  }

  const win = doc.defaultView;
  if (!win) throw new Error("当前 OA 页面不可写入。");
  const requestId = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      win.removeEventListener("message", receive);
      reject(new Error("OA 字段接口响应超时。"));
    }, 2000);
    const receive = (event: MessageEvent) => {
      if (event.source !== win || event.data?.source !== RESPONSE_SOURCE || event.data?.requestId !== requestId) return;
      clearTimeout(timeout);
      win.removeEventListener("message", receive);
      if (event.data.ok) resolve();
      else reject(new Error(event.data.error || "OA 字段接口写入失败。"));
    };
    win.addEventListener("message", receive);
    win.postMessage({ source: REQUEST_SOURCE, requestId, fieldId: id, value }, "*");
  });
  await waitForValue(field, value);
}
