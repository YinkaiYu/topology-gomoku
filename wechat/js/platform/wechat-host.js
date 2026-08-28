const FONT_PATHS = {
  400: 'assets/fonts/noto-serif-sc-400.ttf',
  600: 'assets/fonts/noto-serif-sc-600.ttf',
  700: 'assets/fonts/noto-serif-sc-700.ttf',
};

function safeCall(callback, fallback) {
  try {
    return callback();
  } catch (error) {
    return fallback;
  }
}

function windowInformation() {
  if (typeof wx.getWindowInfo === 'function') {
    return safeCall(() => wx.getWindowInfo(), {});
  }
  return safeCall(() => wx.getSystemInfoSync(), {});
}

function menuInformation() {
  if (typeof wx.getMenuButtonBoundingClientRect !== 'function') {
    return null;
  }
  const rect = safeCall(() => wx.getMenuButtonBoundingClientRect(), null);
  if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) {
    return null;
  }
  return rect;
}

export default class WechatHost {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.fonts = { 400: null, 600: null, 700: null };
    this.brandIcon = null;
    this.screenAwake = null;
    this.metrics = null;
    this.resize();
  }

  resize() {
    const info = windowInformation();
    const width = Math.max(1, Number(info.windowWidth || info.screenWidth) || 375);
    const height = Math.max(1, Number(info.windowHeight || info.screenHeight) || 667);
    const pixelRatio = Math.max(1, Math.min(2, Number(info.pixelRatio) || 1));
    const safeArea = info.safeArea || {
      left: 0,
      right: width,
      top: Number(info.statusBarHeight) || 0,
      bottom: height,
      width,
      height,
    };
    const menu = menuInformation();
    const safeTop = Math.max(0, Number(safeArea.top) || 0, Number(info.statusBarHeight) || 0);
    const safeBottom = Math.min(height, Number(safeArea.bottom) || height);
    const topInset = Math.max(safeTop + 12, menu ? menu.bottom + 10 : safeTop + 20);
    const leftInset = Math.max(14, Number(safeArea.left) || 0);
    const rightInset = Math.max(14, width - (Number(safeArea.right) || width));
    const bottomInset = Math.max(12, height - safeBottom + 12);

    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (typeof this.context.setTransform === 'function') {
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    } else {
      // Assigning either bitmap dimension resets the current transform. Older
      // Canvas implementations without setTransform otherwise compound DPR on
      // every foreground or window-resize event.
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.context.scale(pixelRatio, pixelRatio);
    }
    this.metrics = {
      width,
      height,
      pixelRatio,
      safeArea,
      menu,
      safeTop,
      safeBottom,
      topInset,
      leftInset,
      rightInset,
      bottomInset,
    };
    return this.metrics;
  }

  loadFonts() {
    Object.keys(FONT_PATHS).forEach((weight) => {
      const family = typeof wx.loadFont === 'function'
        ? safeCall(() => wx.loadFont(FONT_PATHS[weight]), null)
        : null;
      this.fonts[weight] = family || null;
      if (!family && typeof console !== 'undefined' && console.warn) {
        console.warn(`[topology-gomoku] bundled font ${weight} failed to load`);
      }
    });
    return this.fonts;
  }

  loadBrandIcon(onReady) {
    if (typeof wx.createImage !== 'function') {
      return null;
    }
    const image = wx.createImage();
    image.onload = () => {
      this.brandIcon = image;
      if (typeof onReady === 'function') {
        onReady(image);
      }
    };
    image.onerror = (error) => {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[topology-gomoku] brand icon failed to load', error);
      }
    };
    image.src = 'assets/brand-icon.png';
    return image;
  }

  font(weight, size) {
    const family = this.fonts[weight] || this.fonts[400];
    return `${weight} ${size}px ${family ? `'${family}'` : 'serif'}`;
  }

  readStorage(key) {
    if (typeof wx.getStorageSync !== 'function') {
      return null;
    }
    const stored = safeCall(() => wx.getStorageSync(key), null);
    if (!stored) {
      return null;
    }
    if (typeof stored === 'string') {
      return safeCall(() => JSON.parse(stored), null);
    }
    return stored;
  }

  writeStorage(key, value) {
    if (typeof wx.setStorageSync !== 'function') {
      return false;
    }
    return safeCall(() => {
      wx.setStorageSync(key, value);
      return true;
    }, false);
  }

  keepScreenAwake(enabled) {
    const next = Boolean(enabled);
    if (this.screenAwake === next) {
      return;
    }
    this.screenAwake = next;
    if (typeof wx.setKeepScreenOn === 'function') {
      safeCall(() => wx.setKeepScreenOn({ keepScreenOn: next }), null);
    }
  }

  vibrate() {
    if (typeof wx.vibrateShort === 'function') {
      safeCall(() => wx.vibrateShort({ type: 'light' }), null);
    }
  }

  bindInput(listeners) {
    if (typeof wx.onTouchStart === 'function') { wx.onTouchStart(listeners.start); }
    if (typeof wx.onTouchMove === 'function') { wx.onTouchMove(listeners.move); }
    if (typeof wx.onTouchEnd === 'function') { wx.onTouchEnd(listeners.end); }
    if (typeof wx.onTouchCancel === 'function') { wx.onTouchCancel(listeners.cancel); }
  }

  bindLifecycle(listeners) {
    if (typeof wx.onHide === 'function') { wx.onHide(listeners.hide); }
    if (typeof wx.onShow === 'function') { wx.onShow(listeners.show); }
    if (typeof wx.onWindowResize === 'function') { wx.onWindowResize(listeners.resize); }
  }
}
