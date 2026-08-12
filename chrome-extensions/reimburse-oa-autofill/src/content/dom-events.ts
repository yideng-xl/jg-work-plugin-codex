type ControlledElement = HTMLInputElement | HTMLTextAreaElement;

export function setControlledValue(element: ControlledElement, value: string): void {
  const previousValue = element.value;
  element.focus();
  element.select();

  const command = element.ownerDocument.execCommand;
  if (typeof command === "function"
    && command.call(element.ownerDocument, "insertText", false, value)
    && element.value === value) {
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
    return;
  }

  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("无法设置 OA 控件的值。");

  setter.call(element, value);
  const tracked = element as ControlledElement & { _valueTracker?: { setValue(value: string): void } };
  tracked._valueTracker?.setValue(previousValue);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.blur();
}
