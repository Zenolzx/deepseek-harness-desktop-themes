# 字体安装、下载与回退

## 预设字体

界面字体（`uiPreset`）：

| key | 字体 | 说明 |
|---|---|---|
| `system` | 系统默认 | 平台默认栈 |
| `lxgw-wenkai` | 霞鹜文楷 LXGW WenKai | <https://github.com/lxgw/LxgwWenKai> · 可下载 |
| `maple-ui` | Maple UI | <https://github.com/subframe7536/maple-font> · 可下载 |
| `misans` | MiSans | <https://hyperos.mi.com/font> |
| `harmonyos-sans` | HarmonyOS Sans SC | 鸿蒙字体 |
| `noto-sans-sc` | Noto Sans SC | <https://fonts.google.com/noto> |
| `ms-yahei-ui` | Microsoft YaHei UI | Windows 自带 |
| `pingfang-sc` | PingFang SC | macOS/iOS 自带 |
| `kaiti` | KaiTi 楷体 | Windows 自带 |

代码字体（`codePreset`）：

| key | 字体 | 可下载 |
|---|---|---|
| `jetbrains-mono` | JetBrains Mono | 是 |
| `maple-mono` | Maple Mono | 是 |
| `cascadia-code` | Cascadia Code | 是 |
| `fira-code` | Fira Code | 是 |
| `source-code-pro` | Source Code Pro | 是 |
| `ibm-plex-mono` | IBM Plex Mono | 是 |
| `consolas` | Consolas | 否（系统） |
| `system-mono` | 系统等宽字体 | 否 |

## 一键下载（推荐）

字体卡片上的「下载到插件」会把字体文件存进 IndexedDB
（`dsh-desktop-themes-fonts`），并用浏览器 `FontFace` 注册：

- **不修改系统字体目录**，不需要管理员权限；
- 下载完成后自动应用为界面/代码字体；
- 重启、离线仍可用；
- 有进度、可取消、可移除；失败会区分网络 / HTTP / 配额 / 校验 / 浏览器不支持。

| 字体 | 文件 | 体积 | 许可 |
|---|---|---|---|
| LXGW WenKai 500 | `lxgw-wenkai-latin-500-normal.woff2` | 7.2 MB | OFL-1.1 |
| Maple Mono VF | `MapleMono[wght]-VF.woff2` | 131 KB | OFL-1.1 |
| JetBrains Mono 400 | `jetbrains-mono-latin-400-normal.woff2` | 21 KB | OFL-1.1 |
| Cascadia Code 400 | `cascadia-code-latin-400-normal.woff2` | 29 KB | OFL-1.1 |
| Fira Code 400 | `fira-code-latin-400-normal.woff2` | 23 KB | OFL-1.1 |
| Source Code Pro 400 | `source-code-pro-latin-400-normal.woff2` | 12 KB | OFL-1.1 |
| IBM Plex Mono 400 | `ibm-plex-mono-latin-400-normal.woff2` | 15 KB | OFL-1.1 |

下载源：官方项目或 Fontsource 镜像（jsDelivr，`Access-Control-Allow-Origin: *`）。
插件本身不打包字体文件。

> `latin` 是 Fontsource 的子集命名；LXGW WenKai 的该文件实际包含完整 CJK 字形，
> 代码字体的该文件只含拉丁字形，中文由回退栈补齐。

## 家族名别名

同一个字体在不同语言环境下的家族名可能不同。插件为每个预设保存别名，并按
「主家族 → 所有别名 → 通用回退」排序：

| 预设 | 主家族 | 别名示例 |
|---|---|---|
| `lxgw-wenkai` | `LXGW WenKai` | `霞鹜文楷`、`LXGW WenKai GB`、`霞鹜文楷 Screen` |
| `ms-yahei-ui` | `Microsoft YaHei UI` | `微软雅黑 UI`、`Microsoft YaHei` |
| `pingfang-sc` | `PingFang SC` | `苹方-简`、`PingFang HK` |
| `kaiti` | `KaiTi` | `楷体`、`KaiTi_GB2312`、`STKaiti` |
| `maple-mono` | `Maple Mono` | `Maple Mono NF CN`、`Maple Mono NF`、`Maple Mono CN` |
| `jetbrains-mono` | `JetBrains Mono` | `JetBrains Mono NL`、`JetBrainsMono Nerd Font` |

## 安装检测与预览

- 每个字体卡片用对应字体渲染预览文字（中英文 + 代码混排）：
  `DeepSeek Harness · 你好，世界` 与 `const answer = await model.generate();`
- 检测使用 canvas 宽度对比（逐个别名探测，结果缓存），而不是
  `document.fonts.check()`——后者对不存在的系统字体会给出误判。
- 状态区分「系统已安装 / 插件内 / 可下载 / 不可用，将使用回退字体」。
- 选择后立即预览并防抖写入宿主设置；刷新/重启后优先恢复明确保存的版本。

## 输入框与硬编码字体

产品的 composer 曾写死 `font-family: Inter, var(--dsw-font-family)`，
导致英文永远显示 Inter。插件现在显式覆盖：

```css
html, body { font-family: var(--dsw-font-family) !important; }
body textarea:not(.xterm-helper-textarea),
body input:not(.xterm-helper-textarea),
body select { font-family: var(--dsw-font-family) !important; }
```

代码块通过 `--ds-font-family-code` 覆盖，终端隐藏 textarea 不受影响。

## 回退栈

界面字体栈（在别名之后）：

```
-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI",
"PingFang SC", "Noto Sans SC", sans-serif
```

代码字体栈：

```
"JetBrains Mono", "Maple Mono", "Cascadia Code", "SFMono-Regular",
Consolas, Menlo, "PingFang SC", "Microsoft YaHei", monospace
```

> 代码栈在 `monospace` 之前保留 `PingFang SC` / `Microsoft YaHei`，使中文代码注释、
> Markdown 内嵌中文不落入无 CJK 字形的等宽字体。

## 自定义字体

“自定义字体”选项允许输入任意已安装字体名（≤256 字符，安全拼入 `font-family`
并加引号转义，不能注入 CSS 规则）。未安装的字体名会被浏览器跳过并回退。

## 字号 / 行高 / 字重 / 连字 / 平滑

- 界面字号 10–24px、代码字号 9–24px、行高 1–2.5、字重 100–900。
- 连字与平滑只作用于代码字体与 body 渲染；宿主组件若硬编码字体族则不受影响
  （本插件遵循 token，并额外覆盖了 composer）。

## 已知限制

- 目前每款字体只下载一个字重（WenKai 500、代码字体 400），粗体由浏览器合成。
- 不提供 host 侧「安装到系统字体目录」；其他应用共用仍需手动安装。
- 自定义字体文件上传（TTF/OTF）尚未开放，计划在 2.1 提供。
- 下载依赖 jsDelivr 可达；企业网络若拦截该域名，下载会失败并给出网络错误提示。
