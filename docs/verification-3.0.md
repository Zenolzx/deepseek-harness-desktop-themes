# 3.0 本地验收记录

验收日期：2026-10-26（Asia/Shanghai）。

| 项目 | 结果 |
| --- | --- |
| `npm test` | 164 通过，0 失败 |
| `npm run typecheck` | 通过 |
| `npm run audit` | 六套主题的文字/界面对比度及表面层级通过 |
| `npm run build` | 宿主和客户端构建通过 |
| `npm run test:studio-browser` | 通过，与人工检查后的 12 张桌面基线比较通过 |
| 可安装包 | `dsh-desktop-themes-3.0.0.tgz` |
| 本机更新 | desktop profile 已更新至 3.0.0，三个核心文件 SHA-256 一致 |

浏览器覆盖 390、768、1024、1280、1920 五档宽度；使用 Edge。测试通过真实客户端 `apply()` 入口，宿主 theme / slots / configForms 服务由本地适配器提供。

联动覆盖：工作模式保留配色、撤销/重做、A/B、临时自定义主题注册、试用不持久化、手动结束/超时/离开恢复、试用期间保存、图片取色、内嵌壁纸风格包导出再安装、PNG 下载、重启恢复主题与壁纸、可撤销删除、窄窗口无横向溢出与减少动态效果。

机器可读记录由验收脚本输出到 `tmp/studio-preview/verification.json`。当前效果图位于 `docs/screenshots/studio/`，主题卡缩略图位于 `src/assets/previews/`。

旧插件备份：`D:/插件/tmp/desktop-backups/desktop-2026-10-26T05-35-13-100Z`。

安装目标：`C:/Users/Lenovo/.dsh/profiles/desktop/node_modules/dsh-desktop-themes`。需要完全退出并重新打开 DSH Desktop 才能重新加载宿主 schema 和客户端构建。未强制中断用户的桌面会话。

本记录确认本地代码、构建、服务适配器和安装文件，不将其等同于真实 Electron 宿主全部页面、其他系统或远程 CI 的验收。全局任意布局与真实终端 ANSI 联动仍受宿主接口限制，详见 [覆盖范围](workspace.md)。
