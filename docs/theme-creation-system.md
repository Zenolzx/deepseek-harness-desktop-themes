# 规则驱动的主题创作系统 · 3.2

文字/参考图 → 按需追问 → 按七项职责设计 → 检索或原创绘制 → 实际渲染 → 技术/视觉检查 → 最多三轮修正 → 用户预览与保存。

## 已接通的实现

| 层 | 代码与行为 |
|---|---|
| 规则 | `skills/dsh-theme-design/SKILL.md` 与分支标准；构建时将技能、设计职责、素材、程序与验收规则内嵌宿主包 |
| 创作调度 | `src/design/creator-host.ts`：JSON action 工具协议 ask/search/design，宿主登记素材、修正计数、单次 nonce 与候选摘要；沿用已认证 Connection API |
| 表达与隔离 | `src/design/artwork.ts`：数据型 Canvas2D 解释器，路径/几何/渐变/噪声/混合/实例/时间表达式，禁止任意代码与网络；限制源大小、层数、实例与计算量 |
| 预览与宿主 | `ArtworkCanvas.tsx`、`runtime.ts` 共用解释器；背景始终在宿主内容下方，稳定控件表面保护交互；不扫描或挖空文字，动态减量/静态回退与生命周期清理 |
| 资源 | `assets.ts`：来源/许可记录，SHA-256 核验、解码预算、本地去重；只有用户明确允许的参考图或合格搜索结果可进入新作品 |
| 检查 | `inspect-client.ts` 真实 DOM/画布捕获四组多尺寸/状态/相位、非空像素、配置/资源往返与性能检查；`creator-host.ts` 校验矩阵，调用视觉模型或明确转人工审阅 |
| 保存与分享 | 草稿历史和明确用户保存；完整风格包 v2 内嵌实际资源，可离线独立恢复；兼容 v1 与旧 generate 接口 |

运行时实际能力以宿主提示中的 action 协议与绘制语法为准。技能工具规范包含后续扩展接口，不等于全部已注册。当前未接入图像生成、真实折射、任意着色器或宿主任意布局。

## 边界与证据

模型只提交数据与设计判断；不能自填通过回执。宿主持有候选作品、摘要、基准与修正计数，浏览器只能继续指定候选的实际渲染任务。nonce 单次有效，修改设计后重新生成完整检查批次；遗漏尺寸或相位、错误摘要、失败的检查都不能完成该任务。

客户端来自可信插件界面。该机制用于防止模型伪造检查或跨版本混用，不是针对已控制用户客户端的攻击者提供远程证明。

当前自动验收范围是作品画布与稳定阅读面样例，不是整套 Electron 页面。截图只证明采样时刻；输入、菜单与浮层保持稳定表面；正文通过正常前后层级绘制，不逐字挖洞。性能是当前设备采样，内存只实施资源预算，尚无精确跨设备内存测量。真实宿主状态仍需临时试用与用户反馈。

`src/design/contract.ts` 是更完整的通用文档/证据协议及其独立测试。当前 Canvas 创作路径使用更小的 artwork 文档和 nonce 检查协议，未把所有通用检查项声明为已通过。后续后端接入必须保留这些边界，不得直接用模型“通过”文本替代检查。

## 规则入口

- [创作 skill](../skills/dsh-theme-design/SKILL.md)
- [设计职责](../skills/dsh-theme-design/references/design-rubric.md)
- [素材规则](../skills/dsh-theme-design/references/assets.md)
- [程序规则](../skills/dsh-theme-design/references/programs.md)
- [验收标准](../skills/dsh-theme-design/references/acceptance.md)
- [前向检验案例](../skills/dsh-theme-design/references/evaluation-cases.md)
- [用户说明与验证命令](ai-theme-studio.md)
