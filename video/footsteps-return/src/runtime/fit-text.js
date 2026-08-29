function readPixelValue(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

export function fitTextToWidth(element, { maxWidth, minFontSize = 42 } = {}) {
  const styles = getComputedStyle(element);
  const initialSize = readPixelValue(styles.fontSize, minFontSize);
  const widthLimit = Number(maxWidth ?? element.dataset.maxWidth ?? element.clientWidth);
  if (!(widthLimit > 0)) {
    throw new RangeError("fitTextToWidth needs a positive maxWidth");
  }

  const canvas = element.ownerDocument.createElement("canvas");
  const context = canvas.getContext("2d");
  const letterSpacing = readPixelValue(styles.letterSpacing, 0);
  const text = element.textContent ?? "";
  let low = Math.min(minFontSize, initialSize);
  let high = initialSize;

  const measuredWidth = (size) => {
    context.font = `${styles.fontStyle} ${styles.fontWeight} ${size}px ${styles.fontFamily}`;
    return context.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
  };

  if (measuredWidth(high) <= widthLimit) {
    return high;
  }
  for (let step = 0; step < 12; step += 1) {
    const middle = (low + high) / 2;
    if (measuredWidth(middle) <= widthLimit) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const fitted = Math.max(minFontSize, Math.floor(low * 10) / 10);
  element.style.fontSize = `${fitted}px`;
  return fitted;
}

export function fitCompositionText(root) {
  return [...root.querySelectorAll("[data-fit-text]")].map((element) => fitTextToWidth(element));
}
