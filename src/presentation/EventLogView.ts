export class EventLogView {
  constructor(
    private readonly element: HTMLOListElement,
    private readonly maximumEntries: number,
  ) {}

  add(message: string): void {
    this.element.querySelector(".event-log__empty")?.remove();
    const entry = document.createElement("li");
    entry.textContent = message;
    this.element.append(entry);

    while (this.element.children.length > this.maximumEntries) {
      this.element.firstElementChild?.remove();
    }
    this.element.scrollTop = this.element.scrollHeight;
  }

  clear(): void {
    const placeholder = document.createElement("li");
    placeholder.className = "event-log__empty";
    placeholder.textContent = "Ready.";
    this.element.replaceChildren(placeholder);
  }
}
