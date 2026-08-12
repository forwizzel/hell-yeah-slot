const minimumFontSizePx = 12;
const fittedElements = new Set<HTMLElement>();
const numericText = new WeakMap<HTMLElement, { readonly full: string; readonly compact: string }>();
let resizeObserver: ResizeObserver | null = null;
let animationFrame = 0;

export function setFittedNumericText(element: HTMLElement, text: string, compactText = text): void {
  const content = fittedContent(element);
  if (content === null) {
    element.textContent = text;
    return;
  }

  content.textContent = text;
  element.setAttribute("aria-label", text);
  element.title = text;
  numericText.set(element, { full: text, compact: compactText });
  registerFittedNumericText(element);
  fitNumericText(element);
}

export function registerFittedNumericText(element: HTMLElement): void {
  if (fittedContent(element) === null) {
    return;
  }

  fittedElements.add(element);
  installResizeObserver(element);
  queueNumericFit();
}

export function fitNumericText(element: HTMLElement): void {
  const content = fittedContent(element);
  if (content === null || element.clientWidth === 0) {
    return;
  }

  const text = numericText.get(element);
  if (text === undefined) {
    return;
  }
  content.textContent = text.full;
  content.style.removeProperty("font-size");
  const baseFontSize = Number.parseFloat(getComputedStyle(content).fontSize);
  const naturalWidth = content.getBoundingClientRect().width;
  if (!Number.isFinite(baseFontSize) || baseFontSize <= 0 || naturalWidth <= 0) {
    return;
  }

  const availableWidth = Math.max(element.clientWidth - 12, 1);
  let fontSize = calculateFittedFontSize(baseFontSize, availableWidth, naturalWidth);
  if (fontSize < minimumFontSizePx) {
    if (text.compact !== text.full) {
      content.textContent = text.compact;
      const compactWidth = content.getBoundingClientRect().width;
      fontSize = calculateFittedFontSize(baseFontSize, availableWidth, compactWidth);
    }
  }
  content.style.fontSize = `${Math.max(minimumFontSizePx, fontSize)}px`;
}

export function calculateFittedFontSize(baseFontSize: number, availableWidth: number, naturalWidth: number): number {
  if (!Number.isFinite(baseFontSize) || !Number.isFinite(availableWidth) || !Number.isFinite(naturalWidth)
    || baseFontSize <= 0 || availableWidth <= 0 || naturalWidth <= 0) {
    return baseFontSize;
  }
  return Math.min(baseFontSize, baseFontSize * availableWidth / naturalWidth);
}

function queueNumericFit(): void {
  if (animationFrame !== 0 || typeof requestAnimationFrame !== "function") {
    return;
  }

  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    for (const element of fittedElements) {
      fitNumericText(element);
    }
  });
}

function installResizeObserver(element: HTMLElement): void {
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver ??= new ResizeObserver(queueNumericFit);
    resizeObserver.observe(element);
  }

  globalThis.addEventListener?.("resize", queueNumericFit, { once: true });
  if (document.fonts !== undefined) {
    void document.fonts.ready.then(queueNumericFit);
    document.fonts.addEventListener("loadingdone", queueNumericFit, { once: true });
  }
}

function fittedContent(element: HTMLElement): HTMLElement | null {
  if (typeof HTMLElement === "undefined" || !(element instanceof HTMLElement)) {
    return null;
  }
  const content = element.querySelector?.(":scope > .text-fit__content");
  return content instanceof HTMLElement ? content : null;
}
