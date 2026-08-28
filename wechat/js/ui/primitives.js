export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function smoothStep(value) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

export function softOut(value) {
  const amount = clamp01(value);
  return 1 - Math.pow(1 - amount, 3.4);
}

export function springOut(value) {
  const amount = clamp01(value);
  if (amount === 0 || amount === 1) {
    return amount;
  }
  return 1 - Math.exp(-7.5 * amount) * Math.cos(9.6 * amount);
}

export function pointInRect(rect, x, y, padding = 0) {
  return Boolean(rect)
    && x >= rect.x - padding
    && x <= rect.x + rect.width + padding
    && y >= rect.y - padding
    && y <= rect.y + rect.height + padding;
}

export function roundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

export function fillRoundedRect(ctx, rect, radius, fillStyle) {
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

const CONTEXT_PIXEL_RATIOS = new WeakMap();

export function setContextPixelRatio(ctx, pixelRatio) {
  if (ctx && (typeof ctx === 'object' || typeof ctx === 'function')) {
    CONTEXT_PIXEL_RATIOS.set(ctx, Math.max(1, Number(pixelRatio) || 1));
  }
}

export function effectPixels(ctx, logicalPixels) {
  const pixelRatio = Math.max(1, Number(CONTEXT_PIXEL_RATIOS.get(ctx)) || 1);
  return logicalPixels * pixelRatio;
}

const GLASS_VARIANTS = {
  card: {
    base: 'rgba(249,250,245,0.16)',
    highlight: 'rgba(255,255,255,0.23)',
    color: 'rgba(205,235,222,0.045)',
    border: 'rgba(255,255,255,0.58)',
    shadow: 'rgba(43,70,58,0.065)',
    shadowBlur: 27,
    shadowY: 10,
  },
  board: {
    base: 'rgba(251,250,246,0.16)',
    highlight: 'rgba(255,255,255,0.22)',
    color: 'rgba(223,241,232,0.045)',
    border: 'rgba(255,255,255,0.48)',
    shadow: 'rgba(43,65,55,0.075)',
    shadowBlur: 40,
    shadowY: 16,
  },
  icon: {
    base: 'rgba(246,252,248,0.10)',
    highlight: 'rgba(255,255,255,0.31)',
    color: 'rgba(203,238,225,0.09)',
    border: 'rgba(255,255,255,0.68)',
    shadow: 'rgba(39,69,58,0.08)',
    shadowBlur: 17,
    shadowY: 7,
  },
  status: {
    base: 'rgba(246,250,247,0.08)',
    highlight: 'rgba(255,255,255,0.20)',
    color: 'rgba(216,239,229,0.065)',
    border: 'rgba(255,255,255,0.62)',
    shadow: 'rgba(35,62,52,0.065)',
    shadowBlur: 14,
    shadowY: 5,
  },
  track: {
    base: 'rgba(27,54,45,0.05)',
    highlight: 'rgba(217,237,228,0.15)',
    color: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.48)',
    shadow: 'rgba(26,65,51,0.07)',
    shadowBlur: 6,
    shadowY: 1,
  },
  thumb: {
    base: 'rgba(244,249,245,0.09)',
    highlight: 'rgba(255,255,255,0.20)',
    color: 'rgba(220,238,229,0.055)',
    border: 'rgba(255,255,255,0.50)',
    shadow: 'rgba(27,60,48,0.085)',
    shadowBlur: 14,
    shadowY: 5,
  },
  sheet: {
    base: 'rgba(237,246,241,0.12)',
    highlight: 'rgba(255,255,255,0.46)',
    color: 'rgba(118,198,176,0.16)',
    border: 'rgba(255,255,255,0.55)',
    shadow: 'rgba(24,38,33,0.16)',
    shadowBlur: 34,
    shadowY: 24,
  },
  dark: {
    base: 'rgba(17,48,39,0.88)',
    highlight: 'rgba(38,75,63,0.82)',
    color: 'rgba(17,48,39,0.76)',
    border: 'rgba(255,255,255,0.32)',
    shadow: 'rgba(24,51,42,0.15)',
    shadowBlur: 20,
    shadowY: 8,
  },
};

export function glassPanel(ctx, rect, options = {}) {
  const style = GLASS_VARIANTS[options.variant || 'card'] || GLASS_VARIANTS.card;
  const pressed = Boolean(options.pressed);
  const disabled = Boolean(options.disabled);
  const bulge = pressed && !options.explicitTransform ? Math.min(3.2, rect.height * 0.045) : 0;
  const x = rect.x - bulge;
  const y = rect.y - bulge * 0.72;
  const width = rect.width + bulge * 2;
  const height = rect.height + bulge * 1.44;
  const radius = (options.radius || Math.min(22, rect.height * 0.28)) + bulge * 0.55;
  const alpha = disabled ? (options.disabledAlpha || 0.48) : 1;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = pressed ? 'rgba(43,65,55,0.11)' : style.shadow;
  ctx.shadowBlur = effectPixels(
    ctx,
    pressed ? Math.max(20, style.shadowBlur * 0.9) : style.shadowBlur,
  );
  ctx.shadowOffsetY = effectPixels(ctx, pressed ? Math.max(7, style.shadowY * 0.7) : style.shadowY);
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = options.base || style.base;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  roundedRectPath(ctx, x, y, width, height, radius);
  const fill = ctx.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, options.tint || style.highlight);
  fill.addColorStop(0.58, options.middle || 'rgba(255,255,255,0.035)');
  fill.addColorStop(1, options.bottom || style.color);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.72)' : (options.stroke || style.border);
  ctx.lineWidth = 1;
  ctx.stroke();

  roundedRectPath(ctx, x + 1.3, y + 1.25, width - 2.6, height - 2.5, Math.max(1, radius - 1.4));
  const edge = ctx.createLinearGradient(x, y, x + width, y + height);
  edge.addColorStop(0, pressed ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.32)');
  edge.addColorStop(0.34, 'rgba(205,255,243,0.10)');
  edge.addColorStop(0.7, 'rgba(255,229,194,0.06)');
  edge.addColorStop(1, 'rgba(48,103,84,0.10)');
  ctx.strokeStyle = edge;
  ctx.lineWidth = options.variant === 'sheet' ? 1.35 : 1;
  ctx.stroke();
  ctx.restore();
}

export function text(ctx, value, x, y, options = {}) {
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color || '#21302c';
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = options.baseline || 'middle';
  ctx.globalAlpha *= options.alpha === undefined ? 1 : options.alpha;
  const letterSpacing = Number(options.letterSpacing) || 0;
  const characters = Array.from(String(value));
  if (letterSpacing && characters.length > 1 && !options.maxWidth) {
    const widths = characters.map((character) => ctx.measureText(character).width);
    const totalWidth = widths.reduce((total, width) => total + width, 0)
      + letterSpacing * (characters.length - 1);
    let cursor = x;
    if (ctx.textAlign === 'center') {
      cursor -= totalWidth / 2;
    } else if (ctx.textAlign === 'right' || ctx.textAlign === 'end') {
      cursor -= totalWidth;
    }
    ctx.textAlign = 'left';
    characters.forEach((character, index) => {
      ctx.fillText(character, cursor, y);
      cursor += widths[index] + letterSpacing;
    });
  } else if (options.maxWidth) {
    ctx.fillText(value, x, y, options.maxWidth);
  } else {
    ctx.fillText(value, x, y);
  }
  ctx.restore();
}

export function pill(ctx, rect, label, options = {}) {
  glassPanel(ctx, rect, {
    variant: 'status',
    radius: rect.height / 2,
    pressed: options.pressed,
    disabled: options.disabled,
  });
  text(ctx, label, rect.x + rect.width / 2, rect.y + rect.height / 2, {
    font: options.font,
    color: options.color || '#5b645f',
    align: 'center',
    letterSpacing: options.letterSpacing,
  });
}

export function drawImageContain(ctx, image, rect, options = {}) {
  if (!image || !rect || rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const sourceWidth = Number(image.naturalWidth || image.width) || 1;
  const sourceHeight = Number(image.naturalHeight || image.height) || 1;
  const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = rect.x + (rect.width - width) / 2;
  const y = rect.y + (rect.height - height) / 2;
  ctx.save();
  ctx.globalAlpha *= options.alpha === undefined ? 1 : options.alpha;
  if (options.shadowColor) {
    ctx.shadowColor = options.shadowColor;
    ctx.shadowBlur = effectPixels(ctx, options.shadowBlur || 0);
    ctx.shadowOffsetY = effectPixels(ctx, options.shadowOffsetY || 0);
  }
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
  return true;
}

export function drawIconAsset(ctx, image, x, y, size, options = {}) {
  return drawImageContain(ctx, image, {
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
  }, options);
}

function ellipsePath(ctx, x, y, radiusX, radiusY, start, end) {
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(x, y, radiusX, radiusY, 0, start, end);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radiusX, radiusY);
  ctx.arc(0, 0, 1, start, end);
  ctx.restore();
}

export function drawIcon(ctx, name, x, y, size, color = '#52615c') {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.085);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (name === 'back') {
    ctx.moveTo(half * 0.45, -half * 0.72);
    ctx.lineTo(-half * 0.4, 0);
    ctx.lineTo(half * 0.45, half * 0.72);
  } else if (name === 'settings') {
    ctx.arc(0, 0, half * 0.32, 0, Math.PI * 2);
    ctx.moveTo(-half * 0.72, -half * 0.28);
    ctx.lineTo(-half * 0.48, -half * 0.18);
    ctx.moveTo(half * 0.72, half * 0.28);
    ctx.lineTo(half * 0.48, half * 0.18);
    ctx.moveTo(-half * 0.28, half * 0.72);
    ctx.lineTo(-half * 0.18, half * 0.48);
    ctx.moveTo(half * 0.28, -half * 0.72);
    ctx.lineTo(half * 0.18, -half * 0.48);
  } else if (name === 'undo' || name === 'replay') {
    ctx.arc(half * 0.08, half * 0.04, half * 0.62, -Math.PI * 0.72, Math.PI * 0.75);
    ctx.moveTo(-half * 0.72, -half * 0.12);
    ctx.lineTo(-half * 0.72, -half * 0.62);
    ctx.lineTo(-half * 0.2, -half * 0.62);
  } else if (name === 'restart') {
    ctx.arc(-half * 0.06, half * 0.02, half * 0.62, -Math.PI * 0.2, Math.PI * 1.18);
    ctx.moveTo(half * 0.72, -half * 0.48);
    ctx.lineTo(half * 0.72, half * 0.02);
    ctx.lineTo(half * 0.22, half * 0.02);
  } else if (name === 'next') {
    ctx.moveTo(-half * 0.35, -half * 0.62);
    ctx.lineTo(half * 0.38, 0);
    ctx.lineTo(-half * 0.35, half * 0.62);
  } else if (name === 'boundary') {
    ctx.moveTo(-half * 0.78, -half * 0.46);
    ctx.lineTo(-half * 0.78, half * 0.46);
    ctx.moveTo(half * 0.78, -half * 0.46);
    ctx.lineTo(half * 0.78, half * 0.46);
    ctx.moveTo(-half * 0.5, 0);
    ctx.lineTo(half * 0.5, 0);
    ctx.moveTo(half * 0.18, -half * 0.25);
    ctx.lineTo(half * 0.5, 0);
    ctx.lineTo(half * 0.18, half * 0.25);
  } else if (name === 'surface') {
    ellipsePath(ctx, 0, -half * 0.42, half * 0.66, half * 0.28, 0, Math.PI * 2);
    ctx.moveTo(-half * 0.66, -half * 0.42);
    ctx.lineTo(-half * 0.66, half * 0.42);
    ctx.moveTo(half * 0.66, -half * 0.42);
    ctx.lineTo(half * 0.66, half * 0.42);
    ellipsePath(ctx, 0, half * 0.42, half * 0.66, half * 0.28, 0, Math.PI);
  } else if (name === 'board') {
    ctx.rect(-half * 0.68, -half * 0.68, half * 1.36, half * 1.36);
    ctx.moveTo(-half * 0.23, -half * 0.68);
    ctx.lineTo(-half * 0.23, half * 0.68);
    ctx.moveTo(half * 0.23, -half * 0.68);
    ctx.lineTo(half * 0.23, half * 0.68);
    ctx.moveTo(-half * 0.68, -half * 0.23);
    ctx.lineTo(half * 0.68, -half * 0.23);
    ctx.moveTo(-half * 0.68, half * 0.23);
    ctx.lineTo(half * 0.68, half * 0.23);
  } else if (name === 'journey') {
    ctx.moveTo(-half * 0.68, half * 0.48);
    ctx.quadraticCurveTo(-half * 0.18, -half * 0.72, half * 0.18, -half * 0.18);
    ctx.quadraticCurveTo(half * 0.42, half * 0.18, half * 0.68, -half * 0.48);
  } else if (name === 'lock') {
    ctx.rect(-half * 0.52, -half * 0.05, half * 1.04, half * 0.82);
    ctx.moveTo(-half * 0.34, -half * 0.05);
    ctx.lineTo(-half * 0.34, -half * 0.34);
    ctx.arc(0, -half * 0.34, half * 0.34, Math.PI, 0);
    ctx.lineTo(half * 0.34, -half * 0.05);
  } else if (name === 'check') {
    ctx.moveTo(-half * 0.68, 0);
    ctx.lineTo(-half * 0.18, half * 0.5);
    ctx.lineTo(half * 0.72, -half * 0.56);
  } else if (name === 'previous') {
    ctx.moveTo(half * 0.35, -half * 0.62);
    ctx.lineTo(-half * 0.38, 0);
    ctx.lineTo(half * 0.35, half * 0.62);
  } else {
    ctx.arc(0, 0, half * 0.55, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}
