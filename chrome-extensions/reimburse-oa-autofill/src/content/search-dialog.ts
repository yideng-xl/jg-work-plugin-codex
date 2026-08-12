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
  const rows = await waitForResultRows(dialog, value);

  if (rows.length !== 1) {
    throw new SearchSelectionError(`搜索值‘${value}’的精确结果数为 ${rows.length}，已停止填写。`);
  }
  rows[0].click();
}
