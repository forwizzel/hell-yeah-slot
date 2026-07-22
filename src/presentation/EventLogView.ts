export class EventLogView {
  constructor(
    private readonly element: HTMLOListElement,
    private readonly maximumEntries: number,
  ) {}

  add(message: string): void {
    const entry = document.createElement("li");
    entry.textContent = message;
    this.element.append(entry);

    while (this.element.children.length > this.maximumEntries) {
      this.element.firstElementChild?.remove();
    }
    this.element.scrollTop = this.element.scrollHeight;
  }

  clear(): void {
    this.element.replaceChildren();
  }
}
