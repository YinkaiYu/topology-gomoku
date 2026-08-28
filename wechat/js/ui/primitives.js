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

export function glassPanel(ctx, rect, options = {}) {
  const pressed = Boolean(options.pressed);
  const disabled = Boolean(options.disabled);
  const bulge = pressed ? Math.min(2.4, rect.height * 0.035) : 0;
  const x = rect.x - bulge;
  const y = rect.y - bulge * 0.65;
  const width = rect.width + bulge * 2;
  const height = rect.height + bulge * 1.3;
  const radius = (options.radius || Math.min(22, rect.height * 0.28)) + bulge * 0.4;
  const alpha = disabled ? 0.46 : 1;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = pressed ? 'rgba(43, 65, 55, 0.12)' : 'rgba(57, 51, 42, 0.09)';
  ctx.shadowBlur = pressed ? 24 : 18;
  ctx.shadowOffsetY = pressed ? 7 : 10;
  roundedRectPath(ctx, x, y, width, height, radius);
  const fill = ctx.createLinearGradient(x, y, x, y + height);
  fill.addColorStop(0, options.tint || 'rgba(255, 255, 255, 0.62)');
  fill.addColorStop(0.52, options.middle || 'rgba(251, 250, 246, 0.46)');
  fill.addColorStop(1, options.bottom || 'rgba(232, 226, 215, 0.34)');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = pressed ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.66)';
  ctx.lineWidth = 1;
  ctx.stroke();

  roundedRectPath(ctx, x + 1.25, y + 1.15, width - 2.5, Math.max(2, height * 0.47), Math.max(1, radius - 1.5));
  const edge = ctx.createLinearGradient(0, y, 0, y + height * 0.5);
  edge.addColorStop(0, pressed ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.24)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = edge;
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
  if (options.maxWidth) {
    ctx.fillText(value, x, y, options.maxWidth);
  } else {
    ctx.fillText(value, x, y);
  }
  ctx.restore();
}

export function pill(ctx, rect, label, options = {}) {
  fillRoundedRect(ctx, rect, rect.height / 2, options.fill || 'rgba(251,250,246,0.52)');
  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, rect.height / 2);
  ctx.strokeStyle = options.stroke || 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  text(ctx, label, rect.x + rect.width / 2, rect.y + rect.height / 2, {
    font: options.font,
    color: options.color || '#5b645f',
    align: 'center',
  });
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
