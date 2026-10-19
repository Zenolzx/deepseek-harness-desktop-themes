# 安装指南

本插件是一个标准的 DSH **双面插件**（宿主 + 客户端）。它**不是** `dsh.bundle`（不带组合 patch），因此安装 = 依赖安装 + 在 profile 的 `cordis.patch.yml` 注册一行。

## 前置

- Node.js ≥ 20（推荐 24）
- pnpm（`dsh plugin` 通过它管理 profile 依赖）
- 已初始化的 `web` profile（首次运行 `dsh web` 会自动初始化）

## 1. 构建

```bash
cd dsh-desktop-themes
npm install
npm run build
```

## 2. 安装依赖包

**本地路径安装（开发/分发）：**

```bash
dsh plugin --profile web add file:D:/path/to/dsh-desktop-themes
```

`dsh plugin` 会把 `file:` 的相对路径锚定到你的当前目录，然后转发给 profile 目录下的 pnpm。

**npm 安装（发布后）：**

```bash
dsh plugin --profile web add dsh-desktop-themes
```

> 输出里可能出现一条提示：`dsh-desktop-themes declares no dsh.bundle — installed as a plain dependency`。这是**正常的**：本插件是普通插件而非组合包，不会自动进入 bundle 列表。

## 3. 注册插件行

编辑 profile 的 `cordis.patch.yml`：

- macOS/Linux：`$DSH_HOME/profiles/web/cordis.patch.yml`（默认 `~/.dsh/profiles/web/cordis.patch.yml`）
- Windows：`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`

追加：

```yaml
- insert:
    - id: desktop-themes
      name: dsh-desktop-themes
```

（若文件已存在其他 `insert:` 块，把这一行加进已有的列表里；没有 `insert:` 块就照上面新建。）

## 4. 重启并验证

```bash
dsh web
```

打开 `http://127.0.0.1:3080` → “设置” → “桌面外观”。

## 本地开发更新（避免同版本缓存）

项目内置一键更新命令：

```bash
npm run deploy:web
```

它会生成类似 `1.6.0-dev.20260816093000` 的唯一安装版本，安装到 `web` profile 后逐一比较 `lib/client.js` 与 `lib/index.js` 的 SHA-256，并在 Windows 上重启通过 `127.0.0.1:3080` 健康检查确认的 DSH 进程。设置页“桌面小人”分组底部会显示源码版本与本次构建编号。

如需自行控制重启：

```bash
npm run deploy:web:no-restart
```

验证：

1. 主题选择器出现量子蓝 / 极光幻境 / 薄荷清风 / 樱雾 / 日落流光 / 黑金星穹 六套主题。
2. 选择任一主题，界面 token 即时切换。
3. 修改字体/透明度/壁纸/毛玻璃/粒子，实时预览。
4. 刷新页面后配置仍保留（0.1.x 写入 `$DSH_HOME/settings.yaml` 的 `ui-desktop-themes` 分节；0.2.x 写入 profile 的 `cordis.patch.yml` 中 `desktop-themes` 条目的 `config`）；壁纸跨会话保留（IndexedDB）。

## DSH 0.2.x 桌面端（Electron）

0.2 桌面端使用独立的 `desktop` profile，并按插件清单声明的 DSH 版本范围做准入检查。1.6.1 起同一份构建兼容 0.1.x 与 0.2.x（peer 范围为 `>=0.1.0-rc.6 <0.3.0`），可以任选一种方式安装：

- 在桌面端的插件管理器中安装本地目录 / tgz；
- 或用桌面端自带的 CLI：

```bash
"<DSH 安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add file:D:/dsh-pack/dsh-desktop-themes-1.7.0.tgz
```

安装后同样需要在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 注册插件行：

```yaml
- insert:
    - id: desktop-themes
      name: dsh-desktop-themes
```

设置持久化：0.2 桌面端的客户端经 `configForms.get('desktop-themes')` 读写该条目的 `Config`（保存在 profile 的 `cordis.patch.yml`）；0.1 Web 端仍使用 `ui-desktop-themes` 命名空间。

## 卸载

```bash
# 1. 从 cordis.patch.yml 删除：
#      - id: desktop-themes
#        name: dsh-desktop-themes
# 2. 移除依赖
dsh plugin --profile web remove dsh-desktop-themes
# 3. 重启
dsh web
```

## 恢复原始外观

- 移除插件行 + 重启即恢复（插件未改任何宿主文件，所有副作用随 fiber 释放）。
- 若要同时清掉插件写入的设置，0.1.x 编辑 `$DSH_HOME/settings.yaml` 删除 `ui-desktop-themes:` 分节；0.2.x 删除 profile `cordis.patch.yml` 中 `desktop-themes` 条目的 `config`。
- 壁纸字节存于浏览器 IndexedDB 数据库 `dsh-desktop-themes`，可在浏览器 DevTools → Application → IndexedDB 中手动删除。

## 排查

| 现象 | 处理 |
|---|---|
| 设置里没有“桌面外观” | 检查 `cordis.patch.yml` 行是否写对、`dsh plugin --profile web list` 是否包含该包、重启是否生效 |
| 页面报“client bundle not found” | 先 `npm run build`，确认 `lib/client.js` 存在 |
| 主题没有生效 | 确认选择了插件主题（而非内置 浅色/深色/跟随系统）；插件主题 id 为 `quantum-blue` 等 |
| 壁纸刷新后丢失 | 确认浏览器未禁用 IndexedDB / 未处于无痕模式；无 IndexedDB 时壁纸为会话级 |
| pnpm 找不到 | 安装 pnpm 后重试 `dsh plugin` |
