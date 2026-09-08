# 性能测试

## 方法

**微基准（已执行，可复现）**

```bash
npm run bench
```

用 `node:perf_hooks` 对热路径纯函数做 1000 次预热 + N 次计时的 µs/op 统计。

**环境**：Node.js v24.14.0，Windows 11（x64），无 GPU/浏览器参与。

## 结果

| 操作 | 耗时 |
|---|---|
| 主题 token 构建（6 套主题 × ~110 token） | 23.35 µs/op |
| 主题切换（注册 + setTheme 逻辑） | 0.13 µs/op |
| 字体 CSS 生成 | 1.37 µs/op |
| 壁纸 CSS 生成 | 0.68 µs/op |
| 毛玻璃 resolve + CSS | 0.53 µs/op |
| 透明度 token 层构建 | 0.83 µs/op |
| 配置校验（无效输入） | 3.97 µs/op |
| 配置导入 + 迁移 | 4.27 µs/op |

## 粒子/光影性能档位

| 模式 | 粒子数量 | Canvas DPR 上限 | 额外禁用 |
|---|---|---|---|
| 省电 `power-saver` | 14–24 | 1 | 20 FPS；连线、鼠标跟随、视差、光标柔光、复杂模糊 |
| 均衡 `balanced`（默认） | 36–64 | 1.25 | 30 FPS |
| 高质量 `quality` | 72–112 | 1.75 | 60 FPS（设置页提示 GPU 占用） |

粒子数量 = 显式 `particleCount` 或按窗口面积 + 密度档位（低/中/高）在性能档位内自动计算；永不生成数百上千粒子。

## 引擎资源管理

- 仅 `requestAnimationFrame`，无 `setInterval`。
- `visibilitychange` 时暂停/恢复动画循环。
- `prefers-reduced-motion` 开启时渲染单帧静态画面并停止循环。
- 设备像素比按性能档位钳制（1 / 1.25 / 1.75），避免高分屏过度渲染。
- 帧率按性能档限制为 20 / 30 / 60 FPS；字体、桌宠或非视觉设置变化不会重建粒子。
- 窗口尺寸变化 150ms 防抖重算。
- 主题/特效切换复用同一个 Canvas 与光晕层，不重复创建；显式视口尺寸避免 CSS containment 把画布压成 0×0。
- 禁用插件时销毁 Canvas、光晕层、事件监听与 rAF 循环。

## 优化要点回顾

- token 由核心色一次性派生（`buildThemeTokens`），主题不重复硬编码。
- 动态 CSS 每次全量重建字符串，由 rAF 合并后一次性写入，避免多次 DOM 写。
- 透明度走 `theme.overrideTokens`（官方可逆 token 层），不额外注入样式。
- 壁纸为单个 `body::before` 层 + `body::after` 遮罩/混合。
- 设置写入 350ms 防抖，滑块连续拖动不高频写盘。
- 无 eval、无高频定时器、无 MutationObserver、无持续 DOM 监听。

## 局限（如实声明）

以下指标**未在本次交付环境实测**，因为它们需要真实运行 `dsh web` 的浏览器运行时：

- 插件启用前后启动时间变化、空闲 CPU、内存增量、快速滚动流畅度、大尺寸壁纸渲染表现。

**复现方法**（在有完整 profile 的环境）：

1. `dsh web` 启动，打开 DevTools → Performance / Memory。
2. 记录启用插件前后的 `performance.now()` 启动时间、进程内存（Chrome 任务管理器）。
3. 切换主题/特效，用 Performance 录制 `theme/change` 到 paint 的耗时。
4. 快速滚动对话，观察长任务与 FPS。
5. 开启/关闭毛玻璃与粒子，对比 Composite/Raster 耗时与内存。
