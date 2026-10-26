## 3.0 工作环境字段

新增可选 `workspace` 对象：`style`（paper/mineral/nocturne）、`mode`（create/focus/review/present）、`ambience`（quiet/balanced/immersive）、`warmth` 与 `depth`（0–1）。这是 schema v4 的向后兼容扩展；旧配置缺失字段时按主题推断材质，保留原来的配色、字体、壁纸、伙伴与特效参数。宿主 schema 与客户端 coercer 均支持该字段。

分享含个人壁纸的完整风格，请使用工作室“导出完整风格包”；普通全部设置 JSON 备份不包含图片。见 [工作环境说明](workspace.md)。

# 配置说明

普通设置持久化在宿主设置文档（默认 `$DSH_HOME/settings.yaml`）的 `ui-desktop-themes` 命名空间，由 schemastery schema 在宿主侧校验；客户端通过 settings scope 读写。设置页顶部显示自动保存状态，并可随时“导出备份”（不含图片字节的 JSON），刷新/重启优先恢复本地快照。自定义壁纸字节单独存放在 IndexedDB 数据库 `dsh-desktop-themes`（存 Blob，配置里只存受管理的 `sourceId`）；六张内置主题壁纸随插件发布。

配置带有 `schemaVersion`（当前 `4`），读取时执行版本迁移。

## 顶层结构

```jsonc
{
  "schemaVersion": 4,
  "scene": "workbench",
  "theme": "mint-breeze",
  "font": { /* … */ },
  "appearance": { /* … */ },
  "wallpaper": { /* … */ },
  "glass": { /* … */ },
  "effects": { /* … */ },
  "performance": { "level": "balanced" },
  "customThemes": [],
  "recentWallpapers": [],
  "pet": { /* … */ }
}
```

### `scene`

- 类型：string；`workbench` / `cinema` / `deep-focus` / `review` / `night` / `present`，空字符串表示手动微调后的自定义状态。
- 默认：`workbench`。
- 场景一次性应用配色、表面、壁纸、动效与阅读字号；字体家族、桌宠与自定义壁纸不被覆盖。

### `theme`

- 类型：string（内置 id 或 `custom-*` 自定义 id）
- 内置（2.0 新配色）：`mint-breeze` Paper / `sakura-mist` Mist / `quantum-blue` Graphite / `aurora-dream` Arc / `sunset-flow` Dune / `obsidian-gold` Noir
- 默认：`mint-breeze`（Paper 工作台）

### `font`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `uiPreset` | string | `system` | 界面字体预设 key |
| `codePreset` | string | `jetbrains-mono` | 代码字体预设 key |
| `uiCustomFamily` | string | `""` | 自定义界面字体（`uiPreset === 'custom'` 时生效） |
| `codeCustomFamily` | string | `""` | 自定义代码字体 |
| `fontSize` | number | 14 | 12–24（12px 为可读性下限） |
| `codeFontSize` | number | 13 | 11–24 |
| `lineHeight` | number | 1.6 | 1–2.5 |
| `fontWeight` | number | 400 | 100–900 |
| `ligatures` | boolean | true | 代码连字 |
| `smoothing` | boolean | true | 字体平滑 |

> 一键下载的字体字节**不写入 settings**：它们存在独立数据库
> `dsh-desktop-themes-fonts`（object store `fonts`）中，配置只保留 preset key。
> 因此导出 JSON 不会夹带字体文件；换机器后未下载的字体会自动回退到别名/回退栈。

### `appearance`

| 字段 | 类型 | 默认 | 范围 |
|---|---|---|---|
| `transparencyEnabled` | boolean | true | |
| `windowOpacity` | number | 1 | 0.55–1 |
| `sidebarOpacity` | number | 1 | 0.55–1 |
| `panelOpacity` | number | 1 | 0.55–1 |
| `inputOpacity` | number | 1 | 0.55–1 |
| `borderRadius` | enum | `standard` | `compact/standard/soft` |
| `contentWidth` | enum | `standard` | `compact/standard/wide` |
| `animationsEnabled` | boolean | true | |
| `contentStyle` | enum | `refined` | `classic/refined` |
| `diffTint` | number | 0.6 | 0.25–2 |

> 所有透明度下限 0.55（对比度保护）。

### `wallpaper`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | true | |
| `sourceId` | string | `builtin:mint-breeze` | 内置 id 或 IndexedDB 受管理资源 id（持久） |
| `path` | string | `""` | 运行时 data/blob URL（**不持久化**，每次重建） |
| `name` | string | `Paper · Built-in` | 内置名称或原文件名 |
| `fit` | enum | `cover` | `cover/contain/stretch/center/tile` |
| `positionX/Y` | number | 50 | 0–100 |
| `focusX` | number | 50 | 0–100；首屏安全区的视觉焦点 |
| `focusY` | number | 42 | 0–100 |
| `safeArea` | enum | `balanced` | `off/balanced/strong`：中心暗角 + 底部/侧边渐隐强度 |
| `scale` | number | 1 | 0.5–3 |
| `opacity` | number | 0.18 | 0–1 |
| `blur` | number | 0 | 0–50 |
| `overlay` | number | 0.4 | 0–1 |
| `saturation` | number | 0.95 | 0–2 |
| `brightness` | number | 1.02 | 0.5–1.5 |
| `tintEnabled` | boolean | true | 与主题强调色混合 |
| `tintStrength` | number | 0.14 | 0–1 |

### `glass`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | false | |
| `blurLevel` | enum | `off` | `off/light/standard/strong`（0/8/16/24px） |
| `strength` | number | 0 | 高级自定义模糊半径；0 = 跟随预设 |
| `saturation` | number | 1 | 0.5–2 |
| `panelOpacity` | number | 0.98 | 0–1 |
| `borderHighlight` | number | 0.28 | 0–1 |
| `shadow` | number | 0.1 | 0–1 |

### `effects`

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | false | 总开关 |
| `preset` | enum | `none` | `none/tech-data/starfield/aurora-flow/fireflies/bubbles/sakura/gold-dust/breathing/custom` |
| `density` | enum | `off` | `off/low/medium/high` |
| `particleCount` | number | 0 | 显式数量；0 = 自动（按面积+档位） |
| `particleSize` | number | 2 | 1–6 |
| `particleSpeed` | number | 0.4 | 0.2–3 |
| `particleOpacity` | number | 0.2 | 0–1 |
| `connectLines` | boolean | false | 连线 |
| `mouseInteraction` | boolean | false | 鼠标互动 |
| `parallax` | boolean | false | 背景视差 |
| `cursorGlow` | boolean | false | 光标跟随柔光 |
| `glowIntensity` | enum | `off` | `off/soft/standard/bright` |
| `animationSpeed` | enum | `still` | `still/gentle/standard/active` |
| `autoThemeColors` | boolean | true | 自动适配主题颜色 |
| `particleColors` | string[] | `[]` | 关闭自动配色时的粒子颜色 |
| `glowColors` | string[] | `[]` | 关闭自动配色时的光影颜色 |

### `performance`

| 字段 | 类型 | 默认 |
|---|---|---|
| `level` | enum | `balanced`（`power-saver/balanced/quality`） |

### `customThemes`

数组，每项：

```jsonc
{
  "id": "custom-xxx",
  "name": "My Theme",
  "base": "quantum-blue",   // 基础主题（决定明暗与 success/warning/danger）
  "colors": {
    "primary": "#3D7EFF", "accent": "#22D3EE", "background": "#0B1120",
    "panel": "#131C31", "text": "#E6EDF7", "particle": "#22D3EE", "glow": "#3D7EFF"
  }
}
```

悬停色、边框、次级背景由主色/背景自动派生；文字对比度自动检测与可一键修正。

### `pet`

桌面小人（桌面宠物）配置。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | boolean | true | 显示开关 |
| `style` | enum | `moonfox` | 固定为 `moonfox`（月灵狐）；旧角色值在加载时自动迁移为月灵狐 |
| `positionX` | number | 89 | 水平锚点，视口百分比 0–100 |
| `positionY` | number | 82 | 垂直锚点，视口百分比 0–100 |
| `size` | number | 144 | 角色尺寸 px，64–288 |
| `animations` | boolean | true | 待机动画（漂浮/眨眼/热气） |
| `speech` | boolean | true | 悬停/打开菜单时显示气泡台词 |

> 位置通过拖拽实时更新并持久化；`power-saver` 性能档位或系统 `prefers-reduced-motion` 下自动关闭动画。
> `moonfox` 使用头部/身体/尾巴三层平滑轮廓。头部以颈部为旋转轴，尾巴以尾根为旋转轴；动作角度、时长与间隔随机浮动，尾巴延迟 80–120ms 后启动并带 1–2 次递减回弹，动作间隙持续保留呼吸式微缩放。

## 版本迁移

- `1 → 2`：主题 id 映射（`tokyo-night→quantum-blue`、`catppuccin-mocha→aurora-dream`、`black-gold→obsidian-gold`）；旧字体名 → 预设；旧 `glass.performanceMode` → `blurLevel`（预设档位时 `strength` 归 0）；新增 effects/performance/customThemes/recentWallpapers。
- `2 → 3`：旧版内置主题的低可见度粒子配方迁移到新的主题专属中密度配方；用户主动设置的高密度/高透明度参数保持不变。
- `3 → 4`：新增 `scene`；按旧主题推断工作台/电影感场景（`mint-breeze`/`sakura-mist`/`quantum-blue` → `workbench`，`aurora-dream`/`sunset-flow`/`obsidian-gold` → `cinema`）。六套主题 id 保留，配色与壁纸在 2.0 全部替换。
- 未来版本在 `src/config/validation.ts` 的 `MIGRATIONS` 表追加步骤。

## 导出 / 导入

- 导出：顶部“导出备份”或“高级 → 备份与重置 → 导出设置 JSON”，下载 `dsh-desktop-themes.json`。
- 导入：schema 校验 + 版本迁移；无效内容不写、不崩溃。
- 导出不含图片字节、token、密码。

## 重置

- 逐控件“恢复默认” / 分组重置 / 全部默认值（Paper 工作台 + 内置矢量壁纸 + 月灵狐）。
- 主题切换支持 8 秒撤销，撤销只回滚主题、壁纸、外观、毛玻璃与特效这五项。

## 可读性门禁

内置主题在发布前都会通过 `npm run audit`：

- 正文/次级/弱化文字对每个实际表面（canvas、panel、layer2、layer3、sidebar）≥ 4.5:1；
- 强调色作为文字 ≥ 4.5:1；按钮文字对强调色 ≥ 4.5:1；
- 成功/警告/危险状态色 ≥ 3:1（非文本阈值）；
- **表面层级**：chrome/canvas 1.14–1.28、panel/canvas 1.08–1.34、layer2/panel 1.05–1.22、layer3/layer2 1.04–1.16、border-l2/l3/l4 分别 1.30–1.70 / 1.50–1.95 / 1.70–2.45。

表面层级是 2.0.1 新增的：WCAG 只保证“字能读”，不保证“左右栏和画布不是同一块颜色”。Windows 下左右栏共用 `--dsw-specific-sidebar-fill`，因此 chrome/canvas 的明度差是唯一稳定的分栏手段。

自定义主题保存时，设置页会显示徽标与具体色对；不达标时给出“一键修正”。系统开启 `prefers-reduced-transparency` 时，半透明与毛玻璃会自动退化为不透明表面。

## 存储与安全

- 设置页顶部提供自动保存状态与“导出备份”；备份会清除运行时 `blob:`/`data:` 路径，不含壁纸图片字节。
- 自定义壁纸 Blob 仍只进入 IndexedDB；内置壁纸由插件包提供。
- 普通设置经 schemastery 校验写入；无效值被拒绝或回退默认。
- 壁纸字节存 IndexedDB Blob，不在设置里存 Base64；替换/清除时删除插件生成的缓存，不删除用户原图。
- 数据损坏时 `coerceConfig` 自动回退默认值，插件不崩溃。
