const FONT_PATHS = {
  400: 'assets/fonts/noto-serif-sc-400.ttf',
  600: 'assets/fonts/noto-serif-sc-600.ttf',
  700: 'assets/fonts/noto-serif-sc-700.ttf',
};

const TOPOLOGY_NAMES = [
  'plane',
  'cylinder',
  'torus',
  'mobius',
  'klein',
  'projective',
  'sphere',
];

const SILHOUETTE_NAMES = TOPOLOGY_NAMES.filter((name) => name !== 'plane');
const SIZE_VARIANTS = ['', '-compact'];
const HOST_TOP_MINIMUM = 68;
const HOST_CAPSULE_GAP = 22;
const MAX_BACKING_PIXELS = 3750000;
const ICON_NAMES = [
  'back',
  'settings',
  'undo',
  'boundary',
  'journey',
  'restart',
  'next-level',
  'review',
  'previous',
  'next',
  'surface',
  'board',
  'check',
];

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

export function computeViewportMetrics(info = {}, menuRect = null) {
  const width = Math.max(1, Number(info.windowWidth || info.screenWidth) || 375);
  const height = Math.max(1, Number(info.windowHeight || info.screenHeight) || 667);
  const requestedPixelRatio = Math.max(1, Math.min(3, Number(info.pixelRatio) || 1));
  const budgetPixelRatio = Math.sqrt(MAX_BACKING_PIXELS / Math.max(1, width * height));
  const pixelRatio = Math.max(1, Math.min(requestedPixelRatio, budgetPixelRatio));
  const safeArea = info.safeArea || {
    left: 0,
    right: width,
    top: Number(info.statusBarHeight) || 0,
    bottom: height,
    width,
    height,
  };
  const validMenu = menuRect
    && Number.isFinite(menuRect.top)
    && Number.isFinite(menuRect.bottom)
    && menuRect.bottom > menuRect.top
    && menuRect.bottom > 0
    && menuRect.bottom <= height
    ? menuRect
    : null;
  const safeTop = Math.max(0, Number(safeArea.top) || 0, Number(info.statusBarHeight) || 0);
  const safeBottom = Math.min(height, Number(safeArea.bottom) || height);
  const hostChromeClearance = Math.max(24, Math.min(32, height * 0.036));
  const capsuleBottom = validMenu ? Number(validMenu.bottom) : 0;
  const hostChromeBottom = capsuleBottom || safeTop + hostChromeClearance;
  const topInset = Math.max(
    HOST_TOP_MINIMUM,
    hostChromeBottom + HOST_CAPSULE_GAP,
  );
  return {
    width,
    height,
    pixelRatio,
    safeArea,
    menu: validMenu,
    safeTop,
    safeBottom,
    hostChromeClearance,
    capsuleBottom,
    hostChromeBottom,
    topInset,
    leftInset: Math.max(14, Number(safeArea.left) || 0),
    rightInset: Math.max(14, width - (Number(safeArea.right) || width)),
    bottomInset: Math.max(12, height - safeBottom + 12),
  };
}

export default class WechatHost {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.fonts = { 400: null, 600: null, 700: null };
    this.brandIcon = null;
    this.mysteryGroundShadow = null;
    this.images = {
      topologies: {},
      silhouettes: {},
      icons: {},
    };
    this.screenAwake = null;
    this.metrics = null;
    this.resize();
  }

  resize() {
    const info = windowInformation();
    const metrics = computeViewportMetrics(info, menuInformation());
    const { width, height, pixelRatio } = metrics;

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
    this.metrics = metrics;
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

  loadVisualAssets(onReady) {
    if (typeof wx.createImage !== 'function') {
      return null;
    }
    const assets = [
      { group: null, key: 'brandIcon', path: 'assets/brand-icon.png' },
      { group: null, key: 'mysteryGroundShadow', path: 'assets/ui/mystery-ground-shadow.png' },
      ...TOPOLOGY_NAMES.flatMap((name) => SIZE_VARIANTS.map((suffix) => ({
        group: 'topologies',
        key: `${name}${suffix}`,
        path: `assets/ui/topologies/${name}${suffix}.png`,
      }))),
      ...SILHOUETTE_NAMES.flatMap((name) => SIZE_VARIANTS.map((suffix) => ({
        group: 'silhouettes',
        key: `${name}${suffix}`,
        path: `assets/ui/silhouettes/${name}${suffix}.png`,
      }))),
      ...ICON_NAMES.map((name) => ({
        group: 'icons',
        key: name,
        path: `assets/ui/icons/${name}.png`,
      })),
    ];
    let pending = assets.length;
    const finish = () => {
      pending -= 1;
      if (pending === 0 && typeof onReady === 'function') {
        onReady(this.images);
      }
    };
    assets.forEach((asset) => {
      const image = wx.createImage();
      image.onload = () => {
        if (asset.group) {
          this.images[asset.group][asset.key] = image;
        } else {
          this[asset.key] = image;
        }
        finish();
      };
      image.onerror = (error) => {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[topology-gomoku] visual asset failed to load: ${asset.path}`, error);
        }
        finish();
      };
      image.src = asset.path;
    });
    return assets.length;
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

  unbindInput(listeners) {
    if (!listeners) {
      return;
    }
    if (typeof wx.offTouchStart === 'function') { wx.offTouchStart(listeners.start); }
    if (typeof wx.offTouchMove === 'function') { wx.offTouchMove(listeners.move); }
    if (typeof wx.offTouchEnd === 'function') { wx.offTouchEnd(listeners.end); }
    if (typeof wx.offTouchCancel === 'function') { wx.offTouchCancel(listeners.cancel); }
  }

  bindLifecycle(listeners) {
    if (typeof wx.onHide === 'function') { wx.onHide(listeners.hide); }
    if (typeof wx.onShow === 'function') { wx.onShow(listeners.show); }
    if (typeof wx.onWindowResize === 'function') { wx.onWindowResize(listeners.resize); }
  }

  unbindLifecycle(listeners) {
    if (!listeners) {
      return;
    }
    if (typeof wx.offHide === 'function') { wx.offHide(listeners.hide); }
    if (typeof wx.offShow === 'function') { wx.offShow(listeners.show); }
    if (typeof wx.offWindowResize === 'function') { wx.offWindowResize(listeners.resize); }
  }
}
