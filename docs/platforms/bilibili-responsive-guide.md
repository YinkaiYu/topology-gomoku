# Toy 多设备自适应设计参考

面向对象：Toy 创作者、前端开发者、互动内容制作者。

这份文档用于帮助 Toy 创作者处理一个常见问题：消费者可能在手机、平板、电脑，以及 B站 App 内外等不同环境访问同一个 Toy。不同环境下的屏幕尺寸、操作方式、布局空间、输入设备都不一样，Toy 需要主动适配这些差异。

## 一句话结论

Toy 不应该只按“一个固定尺寸页面”来设计，而应该根据当前访问环境自动调整：

- 手机端优先考虑触摸、竖屏、底部操作区、虚拟按钮。
- 平板端优先考虑更大的触摸区域和更宽的内容排布。
- PC 端优先考虑鼠标、键盘、横向布局、悬浮态和快捷操作。
- B站 App 内、App 外浏览器、PC 浏览器可能有不同的可视区域和交互限制，需要单独检查。

如果平台 SDK 后续能提供当前用户的设备类型、容器环境等参数，创作者可以直接读取；在没有 SDK 参数时，也可以用浏览器现有能力完成大部分适配。

## 为什么 Toy 需要做自适应

消费者访问 Toy 的方式并不统一。

同一个 Toy 可能出现在：

- 手机端 B站 App 内页面
- 手机浏览器页面
- 平板 App 或浏览器
- PC 浏览器
- 动态、评论区、分享卡片、私域转发链接等入口

这些环境会带来几个明显差异：

- 屏幕宽度不同：手机通常是窄屏，PC 通常是宽屏。
- 屏幕比例不同：竖屏、横屏、折叠屏、平板比例都可能不同。
- 输入方式不同：手机是触摸，PC 是鼠标和键盘，平板可能两者混合。
- 可用高度不同：App 顶部栏、浏览器地址栏、系统安全区会占用空间。
- 性能不同：低端手机和高性能电脑能承载的动画、粒子、渲染量不同。

如果不做适配，用户可能会遇到：

- 按钮太小，手指点不中。
- 操作按钮挡住内容。
- 手机端出现只有 PC 才能用的键盘操作。
- PC 端却显示一套占屏很大的虚拟摇杆。
- 页面超出屏幕，需要横向滚动。
- 重要内容被 App 容器、刘海屏、安全区遮挡。

## 推荐适配思路

不要只依赖一个判断条件。推荐按照下面的顺序做适配：

1. 先用 CSS 根据视口宽度、高度、比例调整布局。
2. 再根据输入能力判断是否显示触摸控件、鼠标悬浮态、键盘提示。
3. 再根据容器环境处理安全区、顶部栏、底部栏、分享入口等差异。
4. 如果 Toy SDK 提供设备类型或运行环境参数，优先使用 SDK 参数作为辅助判断。

也就是说：

- 布局主要看屏幕和容器尺寸。
- 交互主要看输入能力。
- 特殊规则再看平台 SDK 或运行环境。

## 设备类型不要只靠 userAgent

很多创作者会想到通过 `navigator.userAgent` 判断“手机 / 平板 / 电脑”。这可以作为兜底，但不建议作为唯一依据。

更稳妥的方式是组合判断：

- `window.innerWidth`：当前可视区域宽度。
- `window.innerHeight`：当前可视区域高度。
- `window.matchMedia("(pointer: coarse)")`：是否主要是触摸输入。
- `window.matchMedia("(hover: hover)")`：是否支持鼠标悬浮。
- `window.visualViewport`：移动端地址栏、App 容器变化后的真实可视区。
- Toy SDK 参数：如果平台提供 `deviceType`、`platform`、`container` 等字段，应优先使用。

示例判断：

```js
function getToyEnvironment() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;
  const landscape = width > height;

  let layout = "desktop";
  if (width < 768) layout = "phone";
  else if (width < 1100) layout = "tablet";

  return {
    width,
    height,
    layout,
    coarsePointer,
    canHover,
    landscape,
  };
}
```

如果未来 SDK 提供类似参数，建议这样使用：

```js
const sdkEnv = window.BiliToySDK?.getEnv?.();

const deviceType = sdkEnv?.deviceType || getToyEnvironment().layout;
const container = sdkEnv?.container || "browser";
```

## 布局适配建议

### 手机端

手机端重点是“看得清、点得到、不挡内容”。

建议：

- 使用单列布局。
- 主要内容优先展示，次要信息折叠或放到底部。
- 重要按钮固定在底部或拇指容易触达的位置。
- 按钮点击区域建议不小于 `44px x 44px`。
- 避免依赖 hover 效果。
- 游戏类 Toy 可以显示虚拟摇杆、虚拟方向键、虚拟操作按钮。
- 避免横向滚动。
- 适配刘海屏和底部安全区。

常见手机端结构：

```text
顶部：标题 / 状态
中间：主要内容 / 画布 / 互动区域
底部：主要操作按钮 / 虚拟摇杆 / 确认按钮
```

### 平板端

平板不是“更大的手机”，也不是“小一点的电脑”。

建议：

- 可以使用双栏布局，但不要过密。
- 触摸目标仍然要足够大。
- 横屏时可以把工具栏放侧边。
- 竖屏时可以接近手机布局，但展示更多辅助信息。
- 游戏类 Toy 可以保留触摸按钮，同时给更多画面空间。

常见平板端结构：

```text
左侧或上方：主要内容
右侧或下方：工具、设置、说明、排行榜
```

### PC 端

PC 端重点是“空间利用、键鼠效率、信息密度”。

建议：

- 使用更宽的画布或内容区。
- 操作面板可以放在左侧或右侧。
- 支持鼠标悬浮、拖拽、滚轮、右键等能力时，要提供清晰反馈。
- 游戏类 Toy 可以显示键盘操作提示，例如 WASD、方向键、空格。
- 不要默认显示占屏很大的手机虚拟摇杆。
- 页面最大宽度要控制，避免内容在超宽屏上被拉得过散。

常见 PC 端结构：

```text
左侧：工具 / 设置 / 信息
中间：主要内容 / 游戏画布
右侧：结果 / 排行榜 / 辅助面板
```

## 输入方式适配

Toy 的交互不应该只看设备名称，更应该看用户实际能用什么输入方式。

### 触摸输入

适用于手机、平板、触屏电脑。

建议：

- 按钮足够大，间距足够宽。
- 减少精确点击、小拖拽、小滑块。
- 不把重要功能藏在 hover 里。
- 长按、滑动、拖拽要有明显反馈。
- 游戏操作可以提供虚拟摇杆、虚拟方向键、A/B 按钮。

### 鼠标输入

适用于 PC 和部分平板外接鼠标。

建议：

- 支持 hover 态。
- 鼠标拖拽要有光标变化。
- 可点击元素要有明确 hover 反馈。
- 可以使用更紧凑的信息密度。

### 键盘输入

适用于 PC，也适用于部分外接键盘设备。

建议：

- 游戏类 Toy 支持方向键、WASD、空格、Enter、Esc 等常用键。
- 输入框类 Toy 注意 Enter 提交、Esc 取消等习惯。
- 不要让键盘快捷键成为唯一操作方式，手机端也要能完成同样操作。

## CSS 基础模板

可以从这个模板开始做响应式布局：

```css
:root {
  --page-padding: 16px;
  --control-size: 44px;
  --panel-width: 320px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  width: 100%;
  min-height: 100%;
}

body {
  padding:
    env(safe-area-inset-top)
    env(safe-area-inset-right)
    env(safe-area-inset-bottom)
    env(safe-area-inset-left);
}

.toy-shell {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: var(--page-padding);
}

.primary-action {
  min-width: var(--control-size);
  min-height: var(--control-size);
}

@media (min-width: 768px) {
  :root {
    --page-padding: 24px;
  }

  .toy-shell {
    grid-template-columns: 1fr minmax(260px, var(--panel-width));
    align-items: start;
  }
}

@media (min-width: 1100px) {
  :root {
    --page-padding: 32px;
    --panel-width: 360px;
  }

  .toy-shell {
    max-width: 1280px;
    margin: 0 auto;
  }
}

@media (pointer: coarse) {
  .touch-controls {
    display: flex;
  }
}

@media (pointer: fine) and (hover: hover) {
  .touch-controls {
    display: none;
  }

  .clickable:hover {
    filter: brightness(1.05);
  }
}
```

注意这里使用了 `100dvh`，它比传统 `100vh` 更适合移动端，因为移动浏览器地址栏展开和收起时，真实可视高度会变化。

## 游戏类 Toy 的特别建议

游戏 Toy 最容易遇到“手机和 PC 操作完全不同”的问题。

建议采用两套输入，但共用一套游戏逻辑：

- 手机：虚拟摇杆、虚拟方向键、触摸按钮。
- PC：键盘、鼠标、快捷键。
- 平板：默认触摸操作，横屏时可展示更多按钮或信息。

示例逻辑：

```js
const env = getToyEnvironment();

if (env.coarsePointer) {
  showVirtualControls();
} else {
  hideVirtualControls();
  enableKeyboardControls();
}
```

画布类 Toy 建议：

- 画布按容器尺寸缩放，不写死固定宽高。
- 游戏逻辑使用虚拟坐标系，渲染时再映射到真实像素。
- 手机端降低粒子数量、阴影、复杂滤镜。
- 横竖屏切换时重新计算画布尺寸。
- 暂停、弹窗、结果页也要适配小屏。

## B站 App 内外的检查点

同一个链接在不同入口打开，表现可能不同。

建议至少检查：

- B站 App 内打开。
- 手机浏览器打开。
- PC 浏览器打开。
- 从动态卡片进入。
- 从评论区或私信链接进入。
- 横屏和竖屏切换。
- 页面返回、刷新、分享后再次进入。

特别注意：

- App 顶部栏可能压缩可视高度。
- 浏览器地址栏会导致高度变化。
- iOS 底部安全区可能挡住底部按钮。
- 安卓不同机型的实际视口可能不同。
- 分享卡片进入时，用户可能不是从 Toy 首页开始理解内容，需要首屏清楚。

## SDK 参数建议

如果 Toy SDK 能提供当前访问环境，对创作者会非常有帮助。

建议 SDK 可以考虑提供这些字段：

```ts
type ToyRuntimeEnv = {
  deviceType: "phone" | "tablet" | "desktop" | "unknown";
  platform: "ios" | "android" | "windows" | "macos" | "linux" | "unknown";
  container: "bilibili_app" | "browser" | "webview" | "unknown";
  inputType: "touch" | "mouse" | "keyboard" | "mixed" | "unknown";
  viewportWidth: number;
  viewportHeight: number;
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};
```

有了这些信息，创作者就可以更明确地做适配：

```js
const env = await BiliToySDK.getRuntimeEnv();

document.documentElement.dataset.device = env.deviceType;
document.documentElement.dataset.container = env.container;

if (env.deviceType === "phone") {
  enablePhoneLayout();
}

if (env.inputType === "touch") {
  enableTouchControls();
}
```

但即使 SDK 还没有这些参数，创作者也应该先用 CSS 媒体查询和浏览器能力做好基础适配。

## 配套演示 Toy 的交付建议

如果要把这份指南做成一个演示 Toy，建议让 Toy 本身直接体现这些原则，而不只是展示一篇静态文章。

建议包含：

- 一个实时环境面板，展示当前视口尺寸、布局档位、输入能力和容器提示。
- 手机、平板、PC 三个模拟档位，让创作者能在同一台设备上预览不同消费者看到的形态。
- 一个共用的互动核心，例如同一个可移动对象，手机端用虚拟按钮，PC 端用键盘或鼠标。
- 手机端展示安全区，提醒创作者检查顶部栏、底部栏、刘海屏和 App 内 WebView。
- PC 端展示键盘、鼠标和更高信息密度，但要避免内部固定列宽导致内容被裁切。
- 页面末尾直接渲染完整 Markdown 文档，方便创作者边看边对照。
- 提供“下载 MD”按钮，方便人类保存。
- 提供“复制给 Agent”的指令，方便 Agent 读取文档并检查其他 Toy。

Agent 指令可以类似这样：

```text
请读取 toy-responsive-guide.md，并用其中的检查清单审视当前 Toy：
1. 检查手机、平板、PC 三档布局。
2. 检查 pointer/hover/keyboard 等输入差异。
3. 检查 100dvh、safe-area-inset、横竖屏和 App 内 WebView 表现。
4. 输出发现的问题、修改建议和验证结果。
```

演示 Toy 的重点不是把所有 UI 做得复杂，而是让创作者一眼看到：同一个 Toy 可以根据设备、视口和输入方式自然切换。

## 创作者检查清单

发布前可以按这份清单检查：

- 手机端首屏是否能看懂 Toy 是什么。
- 手机端按钮是否足够大，手指是否容易点击。
- 手机端底部按钮是否避开安全区。
- 手机端是否没有横向滚动。
- 平板端是否没有出现过空或过挤的布局。
- PC 端是否没有显示不必要的虚拟摇杆。
- PC 端是否支持键盘或鼠标的自然操作方式。
- PC 端内部面板、工具栏、键盘提示是否没有被固定列宽裁切。
- 横屏、竖屏切换后布局是否正常。
- 页面高度变化后，核心按钮是否仍然可见。
- App 内和浏览器内是否都能正常使用。
- 弱性能设备上动画是否卡顿。
- 结果页、弹窗、分享页是否也完成适配。

## 推荐实践

最简单可落地的方案是：

1. 使用 CSS media query 做手机、平板、PC 三档布局。
2. 使用 `pointer` 和 `hover` 判断是否显示触摸控件。
3. 使用 `100dvh` 和 `safe-area-inset` 处理移动端可视区。
4. 游戏 Toy 把“输入层”和“游戏逻辑层”分开，避免为每个设备写一套游戏。
5. 如果 SDK 提供设备和容器参数，用 SDK 参数增强判断，但不要完全放弃响应式布局。

Toy 的目标不是在每个设备上长得一模一样，而是在每个设备上都自然、可用、好玩。
