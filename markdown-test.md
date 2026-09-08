# 桌面主题渲染测试 · Desktop Theme Render Test

这是一段**中英双语**测试文本，用于验证主题插件对全部 Markdown 表现形式的渲染效果。This bilingual sample exercises every Markdown construct so you can verify your theme's rendering at a glance.

---

## 一、标题层级 · Headings

# H1 一级标题 Heading Level 1
## H2 二级标题 Heading Level 2
### H3 三级标题 Heading Level 3
#### H4 四级标题 Heading Level 4
##### H5 五级标题 Heading Level 5
###### H6 六级标题 Heading Level 6

## 二、行内样式 · Inline Styles

- **加粗 Bold** —— **这是粗体** / **this is bold**
- *斜体 Italic* —— *这是斜体* / *this is italic*
- ***粗斜体 Bold Italic*** —— ***粗斜体组合*** / ***bold and italic***
- ~~删除线 Strikethrough~~ —— ~~被删除的内容~~ / ~~deleted text~~
- `行内代码 Inline Code` —— `const theme = 'aurora-dream'` / `npm run build`
- 高亮 Highlight —— ==高亮文字== 或 <mark>mark 标签高亮</mark>（不同渲染器支持不同）

## 三、链接与自动链接 · Links & Autolinks

- [普通链接 Regular link](https://example.com)
- <https://example.com> —— 自动链接 Autolink
- <someone@example.com> —— 邮箱自动链接 Email autolink

## 四、引用 · Blockquotes

> 这是一层引用。This is a first-level blockquote.
>
> > 这是嵌套引用。This is a nested blockquote.
> >
> > > 三层引用 —— three levels deep.

## 五、列表 · Lists

**无序列表 Unordered list：**
- 中文条目一
- English item two
  - 嵌套条目 Nested item
    - 更深一层 Deeper still

**有序列表 Ordered list：**
1. 第一步 First step
2. 第二步 Second step
   1. 子步骤 sub-step a
   2. 子步骤 sub-step b
3. 第三步 Third step

**任务列表 Task list：**
- [x] 已完成任务 Completed task
- [ ] 未完成任务 Pending task

## 六、表格 · Tables

| 功能 Feature | 中文说明 | English | 状态 Status |
| --- | --- | --- | --- |
| 主题切换 | 六套内置主题 | Six built-in themes | ✅ |
| 毛玻璃 | 背景模糊 + 边框高光 | Backdrop blur & border highlight | ✅ |
| 壁纸 | 支持自定义上传 | Custom wallpaper upload | ✅ |
| 粒子特效 | Canvas 粒子与光晕 | Particles & glow | 🧪 |

## 七、代码块 · Code Blocks（语法高亮 Syntax Highlighting）

```ts
// TypeScript
interface ThemeConfig {
  theme: string;
  glass: { blurLevel: 'off' | 'light' | 'heavy' };
}
const config: ThemeConfig = { theme: 'aurora-dream', glass: { blurLevel: 'heavy' } };
console.log(config.theme);
```

```python
# Python
def apply_theme(palette: dict) -> str:
    return " -> ".join(f"{k}={v}" for k, v in palette.items())

print(apply_theme({"accent": "#3D7EFF", "ink": "#0f1220"}))
```

```bash
# Bash
pnpm install
pnpm run build
```

```json
{
  "name": "dsh-desktop-themes",
  "version": "1.0.0",
  "theme": "quantum-blue"
}
```

```css
/* CSS */
:root {
  --accent: #3d7eff;
  --radius: 16px;
}
.dth-glass { backdrop-filter: blur(24px) saturate(1.2); }
```

```diff
- const oldValue = "before";
+ const newValue = "after";
```

## 八、数学公式 · Math (KaTeX)

行内公式 Inline math：当 $a \ne 0$ 时，$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$。

块级公式 Block math：

$$
\int_{-\infty}^{+\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

$$
E = mc^2
$$

## 九、脚注 · Footnotes

这是一段带脚注的文字[^1]，后面还有另一个脚注[^2]。

[^1]: 第一个脚注的说明文字 —— First footnote note.
[^2]: 第二个脚注 —— Second footnote note.

## 十、图片 · Image

![示例图片 Sample image](https://picsum.photos/seed/dsh/640/320)

## 十一、分隔线 · Horizontal Rule

---

以上覆盖了标题、行内样式、链接、引用、列表、任务列表、表格、代码高亮、数学公式、脚注、图片与分隔线。That's all forms.

