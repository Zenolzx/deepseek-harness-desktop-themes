# 平台兼容性

本插件面向 **DSH Desktop（Electron）** 的渲染层，与操作系统交互只经由标准 Web API；Web profile 仍可加载同一构建，但 2.0 起只保证桌面端体验。

| 能力 | Windows 10/11 | macOS | Linux |
|---|---|---|---|
| 主题 / 字体 / 设置 | ✅ | ✅ | ✅ |
| 半透明背景 | ✅ | ✅ | ✅ |
| 自定义壁纸（IndexedDB 持久化） | ✅ | ✅ | ✅ |
| 粒子/光影 Canvas-2D | ✅ | ✅ | ✅ |
| 毛玻璃 `backdrop-filter` | ✅ Chromium/Edge 111+ | ✅ Safari 16.2+ | ✅ Firefox 113+ / Chromium |
| 桌面小人（SVG + `shell.overlay` 浮动层 + Pointer Events 拖拽） | ✅ | ✅ | ✅ |

## 桌面小人说明

- 小人渲染在 DSH 布局的 `shell.overlay` 浮动层（z-index 20），位于各列之上、滚动容器之外；菜单与角色本体自行接管指针事件，不遮挡其余界面。
- 拖拽使用 Pointer Events（含触屏），位置以视口百分比持久化；点击阈值 3px 区分“拖拽”与“点击打开菜单”。
- `prefers-reduced-motion`、`pet.animations` 开关、`power-saver` 档位三者任一命中即关闭动画（漂浮/眨眼/热气）；CSS 侧 `@media (prefers-reduced-motion: reduce)` 兜底。

## 降级行为

- **不支持 `backdrop-filter`**：自动回退为半透明纯色填充（`buildGlassCss(supported=false)`），文字对比度不受影响。
- **不支持透明窗口的平台**：透明度仅作用于 CSS 背景 token（非原生窗口材质），本就是纯 CSS，无“不支持”问题。
- **壁纸加载失败**：IndexedDB 不可用、文件损坏或 SVG 解码失败时回退到主题背景；设置页显示空状态与“重新选择图片”，不再用 `display:none` 留白。
- **IndexedDB 不可用**：壁纸退化为会话级 blob URL（刷新后丢失），其余设置仍正常持久化。
- **无 Canvas 2D**（极罕见）：粒子引擎 `getContext` 返回 null 时安全跳过绘制，不影响其他功能。

## 浏览器要求

- 支持 CSS 自定义属性（所有现代浏览器均支持）。
- 半透明用 `rgba()`（全兼容）。
- 毛玻璃用 `backdrop-filter` + `-webkit-backdrop-filter` 双前缀。
- 壁纸持久化需要 IndexedDB；字体检测需要 Font Loading API（缺失时回退为“可用”且仍安全回退）。

## 无障碍

- 所有表单控件有 `<label>` + `id` 关联，键盘可及。
- `:focus-visible` 明确焦点环。
- 状态不只靠颜色（开关有 On/Off 文本、`aria-checked`/`aria-pressed`/`role="radiogroup"`）。
- 尊重 `prefers-reduced-motion`（CSS 强制关闭过渡/动画；粒子渲染静态帧）与 `prefers-reduced-transparency`（关闭半透明 token 与毛玻璃）。
- 正文与关键控件尽量满足 WCAG AA；透明度下限 0.55 保护对比度；自定义配色提供对比度检测与一键修正。
- 125%/150%/200% 缩放下设置页可回流（窄屏时导航折叠为横向）。
- 长标题/路径/错误信息正常换行（`overflow-wrap: anywhere`）。
