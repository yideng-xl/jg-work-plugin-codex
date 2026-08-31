import { setControlledValue } from "./dom-events";

export class SearchSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchSelectionError";
  }
}

function isVisible(element: Element): boolean {
  return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true";
}

function findDialog(doc: Document, title: string): HTMLElement | undefined {
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .filter(isVisible)
    .find((dialog) => Array.from(dialog.querySelectorAll("h1, h2, h3, [class*='title']"))
      .some((heading) => heading.textContent?.trim() === title));
}

function waitForDialog(doc: Document, title: string, timeoutMs = 5000): Promise<HTMLElement> {
  const current = findDialog(doc, title);
  if (current) return Promise.resolve(current);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const dialog = findDialog(doc, title);
      if (!dialog) return;
      clearTimeout(timeout);
      observer.disconnect();
      resolve(dialog);
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new SearchSelectionError(`等待搜索窗口‘${title}’超时。`));
    }, timeoutMs);
    observer.observe(doc.body, { childList: true, subtree: true });
  });
}

function exactRows(dialog: HTMLElement, value: string): HTMLTableRowElement[] {
  return Array.from(dialog.querySelectorAll<HTMLTableRowElement>("tr")).filter((row) =>
    Array.from(row.querySelectorAll("td")).some((cell) => cell.textContent?.trim() === value),
  );
}

function normalizedText(element: Element): string {
  return element.textContent?.replace(/\s+/g, "") ?? "";
}

function preferRendered<T extends HTMLElement>(elements: T[]): T | undefined {
  return elements.find((element) => element.getClientRects().length > 0) ?? elements.at(-1);
}

function findSearchControls(dialog: HTMLElement): {
  input: HTMLInputElement;
  button: HTMLButtonElement;
} | undefined {
  const inputs = Array.from(dialog.querySelectorAll<HTMLInputElement>("input[type='text'], input.ant-input"));
  const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
    .filter((button) => normalizedText(button) === "搜索");
  const input = preferRendered(inputs);
  const button = preferRendered(buttons);
  return input && button ? { input, button } : undefined;
}

function waitForExactRows(dialog: HTMLElement, value: string, timeoutMs = 5000): Promise<HTMLTableRowElement[]> {
  const current = exactRows(dialog, value);
  if (current.length > 0) return Promise.resolve(current);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const rows = exactRows(dialog, value);
      if (rows.length === 0) return;
      clearTimeout(timeout);
      observer.disconnect();
      resolve(rows);
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(exactRows(dialog, value));
    }, timeoutMs);
    observer.observe(dialog, { childList: true, subtree: true, characterData: true });
  });
}

function waitForResultRows(dialog: HTMLElement, value: string, timeoutMs = 5000): Promise<HTMLTableRowElement[]> {
  const inspect = () => ({
    all: dialog.querySelectorAll("tbody tr").length,
    exact: exactRows(dialog, value),
  });
  const current = inspect();
  if (current.all > 0) return Promise.resolve(current.exact);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const result = inspect();
      if (result.all === 0) return;
      clearTimeout(timeout);
      observer.disconnect();
      resolve(result.exact);
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new SearchSelectionError(`等待搜索值‘${value}’的结果超时。`));
    }, timeoutMs);
    observer.observe(dialog, { childList: true, subtree: true });
  });
}

export async function selectExactDialogValue(
  openButton: HTMLElement,
  dialogTitle: string,
  value: string,
): Promise<void> {
  openButton.click();
  const dialog = await waitForDialog(openButton.ownerDocument, dialogTitle);
  let rows = await waitForResultRows(dialog, value);

  if (rows.length === 0) {
    const controls = findSearchControls(dialog);
    if (controls) {
      setControlledValue(controls.input, value);
      controls.button.click();
      rows = await waitForExactRows(dialog, value);
    }
  }

  if (rows.length !== 1) {
    throw new SearchSelectionError(`搜索值‘${value}’的精确结果数为 ${rows.length}，已停止填写。`);
  }
  rows[0].click();
}
