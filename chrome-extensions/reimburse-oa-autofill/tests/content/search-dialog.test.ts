import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSelectionError, selectExactDialogValue } from "../../src/content/search-dialog";

function searchFixture(values: string[]): { button: HTMLButtonElement; clicks: ReturnType<typeof vi.fn> } {
  const button = document.createElement("button");
  const clicks = vi.fn();
  button.addEventListener("click", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `<h2>费用分类（差旅）</h2><table><tbody>${values
      .map((value) => `<tr><td>${value}</td></tr>`)
      .join("")}</tbody></table>`;
    for (const row of Array.from(dialog.querySelectorAll("tr"))) row.addEventListener("click", clicks);
    document.body.append(dialog);
  });
  document.body.append(button);
  return { button, clicks };
}

function delayedSearchFixture(value: string): { button: HTMLButtonElement; clicks: ReturnType<typeof vi.fn> } {
  const button = document.createElement("button");
  const clicks = vi.fn();
  button.addEventListener("click", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = '<h2>费用分类（差旅）</h2><table><tbody></tbody></table>';
    document.body.append(dialog);
    setTimeout(() => {
      const row = document.createElement("tr");
      row.innerHTML = `<td><div class="wea-url">${value}</div></td>`;
      row.addEventListener("click", clicks);
      dialog.querySelector("tbody")!.append(row);
    }, 20);
  });
  document.body.append(button);
  return { button, clicks };
}

describe("selectExactDialogValue", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("clicks the one exact result", async () => {
    const { button, clicks } = searchFixture(["差旅费-交通费", "差旅-住宿费"]);
    await selectExactDialogValue(button, "费用分类（差旅）", "差旅费-交通费");
    expect(clicks).toHaveBeenCalledOnce();
  });

  it("waits for asynchronously loaded exact results", async () => {
    const { button, clicks } = delayedSearchFixture("差旅费-交通费");
    await selectExactDialogValue(button, "费用分类（差旅）", "差旅费-交通费");
    expect(clicks).toHaveBeenCalledOnce();
  });

  it.each([
    [["其他费用"], "zero"],
    [["差旅费-交通费", "差旅费-交通费"], "multiple"],
  ])("rejects %s exact results", async (values) => {
    const { button } = searchFixture(values as string[]);
    try {
      await selectExactDialogValue(button, "费用分类（差旅）", "差旅费-交通费");
      throw new Error("预期搜索选择失败。");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchSelectionError);
      expect((error as Error).message).toContain("差旅费-交通费");
    }
  });
});
