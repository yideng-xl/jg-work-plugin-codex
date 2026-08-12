import type { ExtensionMessage } from "../shared/types";
import { fillReimbursementPage } from "./oa-adapter";
import { inspectPage } from "./page-contract";

export async function handleExtensionMessage(message: ExtensionMessage, doc: Document = document): Promise<unknown> {
  if (message.type === "INSPECT_PAGE") return inspectPage(doc);
  if (message.type === "FILL_PAGE") return fillReimbursementPage(doc, message.workbook, message.modes);
  throw new Error("不支持的插件消息。");
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    handleExtensionMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({
        ok: false,
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    return true;
  });
}

document.documentElement.dataset.reimburseAutofill = "ready";
