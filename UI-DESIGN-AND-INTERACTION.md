# OpenCode 项目 UI 设计与交互总结

本文档总结本项目的 UI 架构、交互模式与设计决策，便于在其他项目（尤其是终端 TUI 或桌面应用）中复用其设计与交互思路。

---

## 一、技术栈概览

| 层级 | 技术 | 用途 |
|------|------|------|
| **TUI（终端 UI）** | `@opentui/solid` + Solid.js | 终端内 React-like 组件、布局、键盘/鼠标事件 |
| **CLI 输出** | 自定义 `UI` 命名空间 | ANSI 样式、打印、Logo、简单 readline 输入 |
| **状态** | Solid.js（signals、store、context） | 响应式状态与依赖追踪 |
| **事件** | 内部 BusEvent + Zod | 类型安全的应用内事件（命令、Toast、路由等） |

---

## 二、TUI 渲染与布局

### 2.1 入口与配置

- 使用 `@opentui/solid` 的 `render()` 挂载根组件，传入配置：
  - `targetFps`、`exitOnCtrlC`、`useKittyKeyboard`、`autoFocus`
  - `consoleOptions.keyBindings`、`onCopySelection`：控制台选区复制行为
- 根节点为全屏 `box`，宽高由 `useTerminalDimensions()` 提供，背景色来自主题。

### 2.2 布局原语

- **box**：主要容器，支持 `width`、`height`、`flexDirection`、`gap`、`padding*`、`alignItems`、`justifyContent`、`position`（如 `absolute`）等。
- **text**：文本，支持 `fg`（前景色）、`attributes`（如 `TextAttributes.BOLD`）、`wrapMode`。
- **scrollbox**：可滚动区域，需指定 `height`。
- 颜色使用 `@opentui/core` 的 `RGBA`（如 `theme.background`、`RGBA.fromInts(0,0,0,150)` 半透明遮罩）。

### 2.3 交互钩子

- `useKeyboard(callback)`：全局键盘事件，可 `evt.preventDefault()` / `evt.stopPropagation()` 拦截。
- `useRenderer()`：访问底层渲染器，如 `getSelection()`、`clearSelection()`、`setTerminalTitle()`、`suspend()`/`resume()`、`toggleDebugOverlay()`、`console.toggle()` 等。
- `useTerminalDimensions()`：返回当前终端宽高，用于自适应布局。

---

## 三、状态与上下文架构

### 3.1 上下文分层顺序（自外而内）

为保证依赖顺序，Provider 嵌套顺序固定，例如：

```
ArgsProvider → ExitProvider → KVProvider → ToastProvider → RouteProvider
  → SDKProvider → SyncProvider → ThemeProvider → LocalProvider → KeybindProvider
  → PromptStashProvider → DialogProvider → CommandProvider
  → FrecencyProvider → PromptHistoryProvider → PromptRefProvider
  → App
```

- **ArgsProvider**：CLI 参数（continue、sessionID、model、agent、prompt、fork 等）。
- **ExitProvider**：退出回调，统一收口退出逻辑。
- **KVProvider**：持久化键值（如 theme、theme_mode、terminal_title_enabled、animations_enabled）。
- **ToastProvider**：轻提示的显示与关闭。
- **RouteProvider**：路由（home / session），`navigate(route)` 驱动页面切换。
- **SDKProvider**：后端 URL、fetch、headers、events（EventSource），为 TUI 提供 API 与实时事件。
- **SyncProvider**：与服务端同步的数据（session、provider、message、config 等）。
- **ThemeProvider**：主题名、dark/light 模式、解析后的 theme 对象与 syntax 高亮。
- **LocalProvider**：本地 UI 状态（当前 model、agent、variant 等）。
- **KeybindProvider**：快捷键解析与 leader 键逻辑。
- **DialogProvider**：对话框栈，`replace`/`clear`、Esc 关闭。
- **CommandProvider**：命令列表注册、触发、slash 与 keybind 绑定。

### 3.2 createSimpleContext 模式

通过 `createSimpleContext({ name, init })` 统一创建「带 Provider 的 Context」：

- `init` 可接收 props（如 Theme 的 `mode`），在 Provider 内执行一次，返回值作为 context value。
- 可选 `init.ready`：为 false 时 Provider 不渲染子组件（用于异步就绪，如主题加载）。
- 使用方通过 `useXxx()` 获取，并在非 Provider 下抛出明确错误。

这样每个能力（路由、主题、快捷键、对话框等）职责单一，且依赖关系通过嵌套顺序表达清晰。

---

## 四、交互模式

### 4.1 键盘优先

- 所有主要操作都绑定到快捷键（keybind），通过 **KeybindProvider** 从配置（如 `sync.data.config.keybinds`）解析并匹配。
- **Leader 键**：先按 leader，再按组合键，避免与终端/编辑器冲突；leader 有 2 秒超时自动取消。
- 匹配逻辑：`keybind.match(key, evt)`，支持 `ParsedKey`（name、ctrl、shift 等）；特殊键如 Ctrl+Underscore 做单独映射。
- 展示：`keybind.print(key)` 用于在命令列表等地方显示「可读的快捷键说明」。

### 4.2 全局键盘与焦点

- 在 App 根或 Dialog 等处使用 `useKeyboard`：
  - 无对话框时：根据 keybind 执行命令（如打开命令列表、切换 session、打开设置等）。
  - 有对话框时：Escape 或 Ctrl+C 关闭当前对话框并弹栈，必要时 `refocus()` 回之前的焦点。
- 对话框打开时会将当前焦点保存并 blur，关闭后通过 `setTimeout(..., 1)` 再 focus，避免焦点丢失。

### 4.3 鼠标与选区

- **选区复制**：
  - 若启用「选择即复制」：`onMouseUp` 时调用 `Selection.copy(renderer, toast)`，复制选中文本并 toast。
  - 若禁用：仅在 Ctrl+C 或右键时复制选区，Escape 清除选区。
- 对话框最外层 **backdrop** 使用 `onMouseDown`/`onMouseUp`：若在 backdrop 上发生的是「先选中再点击」，则视为取消选择而不关闭对话框；否则 `onMouseUp` 关闭对话框。内容区域 `onMouseUp` 中 `stopPropagation()` 防止误关。
- **Link** 组件：`<text onMouseUp={() => open(href)}>`，点击在默认浏览器打开链接。

### 4.4 对话框栈

- **DialogProvider** 维护 `stack: { element, onClose }[]` 和 `size: 'medium' | 'large'`。
- **replace(element, onClose?)**：清空栈并推入新对话框；若栈原为空，会先保存当前焦点并 blur。
- **clear()**：关闭栈中所有项并清空，再 refocus。
- **Dialog** 组件：全屏半透明 backdrop + 居中内容 box（宽度 60/80、maxWidth 限制），点击 backdrop 触发 onClose；内容区阻止冒泡。
- 键盘：Escape/Ctrl+C 弹栈并调用当前项的 onClose，再 refocus（若存在选区则可能不关，避免误触）。

---

## 五、命令与命令面板

### 5.1 命令注册

- **CommandProvider** 提供 `register(cb)`，`cb` 返回 `CommandOption[]`。
- 每条命令包含：`title`、`value`、`category`、`keybind`（对应 KeybindsConfig 的 key）、`slash`（/name、aliases）、`suggested`、`hidden`、`onSelect(dialog)`。
- 注册用 `createMemo(cb)`，这样命令列表随依赖（如 sync、route）自动更新；组件卸载时从 registrations 中移除。

### 5.2 触发方式

- **快捷键**：`useKeyboard` 中遍历 `entries()`，若 `keybind.match(option.keybind, evt)` 则执行 `option.onSelect(dialog)`。
- **命令面板**：某 keybind（如 `command_list`）打开 `DialogSelect`，展示所有可见命令；支持模糊过滤、分类、建议置顶。
- **Slash 命令**：在输入框输入 `/` 可调出与命令面板一致的选项，选择后 `trigger(option.value)`。
- **外部事件**：`sdk.event.on(TuiEvent.CommandExecute.type, evt => command.trigger(evt.properties.command))`，便于服务端或 MCP 触发命令。

### 5.3 DialogSelect 通用列表

- **DialogSelect**：通用「标题 + 过滤输入 + 分组列表」对话框。
- 选项：`title`、`value`、`description`、`footer`（如快捷键文案）、`category`、`disabled`、`onSelect(ctx)`。
- 过滤：使用 fuzzysort，对 title/category 加权；过滤后可按 category 分组展示。
- 键盘：上下移动高亮，Enter 选中；支持 `current` 受控高亮项。
- 可配合 `keybind` 数组在列表内绑定额外快捷键（如删除、重命名等）。

---

## 六、主题系统

### 6.1 主题数据结构

- 主题为 JSON，包含 `defs`（颜色名 → 十六进制）和 `theme`（语义 token → 颜色或引用）。
- 支持 **dark/light 变体**：`theme.primary` 可为 `{ dark: "#...", light: "#..." }` 或引用 `defs` 中的 key。
- 解析时根据当前 `mode` 取对应颜色，最终得到 `ThemeColors`（primary、text、background、border、diff*、markdown*、syntax* 等），并转为 `RGBA`。

### 6.2 语义 token 设计

- **基础**：primary、secondary、accent、error、warning、success、info、text、textMuted、selectedListItemText。
- **背景**：background、backgroundPanel、backgroundElement、backgroundMenu。
- **边框**：border、borderActive、borderSubtle。
- **Diff**：diffAdded、diffRemoved、diffContext、diffHunkHeader、diff*Bg、diffLineNumber 等。
- **Markdown**：markdownText、markdownHeading、markdownLink、markdownCode 等。
- **语法高亮**：syntaxComment、syntaxKeyword、syntaxFunction、syntaxString 等。
- 可选：`thinkingOpacity`、`selectedListItemText`、`backgroundMenu`（缺省时用默认或 backgroundElement）。

### 6.3 使用方式

- `useTheme()` 返回 `theme`（当前解析后的颜色对象）、`syntax`/`subtleSyntax`（高亮规则）、`selected`、`set(themeName)`、`mode()`、`setMode(dark|light)` 等。
- 列表选中前景色：`selectedForeground(theme, bg)`，若未定义 selectedListItemText 则按背景亮度计算黑白对比色。
- **系统主题**：可从终端调色板（如 `renderer.getPalette()`）生成 `system` 主题，与 `mode` 一起用于「跟随终端」的体验。

---

## 七、Toast 与反馈

- **ToastProvider** 维护 `currentToast: { title?, message, variant, duration } | null`。
- **show(options)**：设置 currentToast，用 `setTimeout` 在 duration 后清空；连续 show 会重置定时器。
- **error(err)**：若 err 为 Error 用 message，否则固定文案。
- **Toast 组件**：绝对定位（如右上角），用 `theme.backgroundPanel` 与 `theme[variant]` 边框，展示 title + message；无 title 时仅 message。
- 事件：`sdk.event.on(TuiEvent.ToastShow.type, evt => toast.show(evt.properties))`，便于后端驱动提示。

---

## 八、路由

- **Route** 为联合类型：`{ type: 'home', initialPrompt? }` 或 `{ type: 'session', sessionID, initialPrompt? }`。
- **RouteProvider** 用 store 存当前 route，提供 `data` 与 `navigate(route)`。
- 根内容用 `<Switch>/<Match when={route.data.type === 'home'}><Home /></Match> ...` 切换。
- 初始化（如 `--continue`、`--session`、`--fork`）在 onMount/createEffect 中根据 args 与 sync 状态调用 `navigate`。

---

## 九、事件总线（应用内解耦）

- 使用 **BusEvent.define(name, zodSchema)** 定义事件类型，保证 payload 类型安全。
- 典型事件：
  - **tui.prompt.append**：向输入框追加文本。
  - **tui.command.execute**：执行指定命令（如 session.list、prompt.submit）。
  - **tui.toast.show**：显示 Toast（title、message、variant、duration）。
  - **tui.session.select**：切换到指定 sessionID。
- 订阅：`sdk.event.on(EventType.type, handler)`；发布由 SDK/服务端或内部调用，实现 UI 与后端、多模块间的解耦。

---

## 十、CLI 层 UI（非 TUI）

- **UI 命名空间**（如 `cli/ui.ts`）：
  - **Style**：ANSI 转义常量（TEXT_HIGHLIGHT、TEXT_DIM、TEXT_WARNING、TEXT_DANGER、TEXT_SUCCESS 等）。
  - **print** / **println**：写 stderr；**empty()** 保证上一次输出后换行。
  - **logo(pad?)**：多行 Logo 绘制，用字符与颜色块（如 `_`、`^`、`~`）拼出品牌图。
  - **input(prompt)**：readline 同步用户输入。
  - **error(message)**：红色 "Error: " + message。
- 适合在非 TUI 命令（如 init、upgrade）中做简单提示与错误输出。

---

## 十一、可复用设计要点小结

1. **分层 Context**：按「能力」拆成独立 Provider，依赖关系用嵌套顺序表达，便于测试与替换。
2. **键盘优先 + 键位可配置**：所有操作可键控；keybind 从配置读取，支持 leader 与可读展示。
3. **对话框栈 + Esc 关闭**：replace/clear 统一管理；Esc/Ctrl+C 弹栈并 refocus，避免焦点丢失。
4. **主题 token 化**：语义 token + defs 引用 + dark/light，便于换肤与无障碍对比度。
5. **列表与命令统一抽象**：DialogSelect 负责过滤、分组、键盘导航；CommandOption 统一描述命令、快捷键与 slash。
6. **事件驱动**：用类型安全的事件总线连接「后端 / MCP / 多模块」与 UI（Toast、命令、路由），避免直接耦合。
7. **选区与复制**：明确「选择即复制」与「按键复制」两种策略，并在对话框与全局键盘中区分「选中状态」与「关闭对话框」。
8. **错误边界与降级**：TUI 根节点用 ErrorBoundary，fallback 提供「复制 issue URL」「Reset」「Exit」等，并保证 Ctrl+C 可退出。

---

## 十二、在其他项目中复用的建议

- **终端 TUI**：可直接参考 Provider 顺序、Dialog/Toast/Command/Keybind 的设计，以及 theme token 与 JSON 主题格式；若不用 Solid，可改为 React Context + 相同分层与交互语义。
- **桌面/Web**：可复用「命令面板 + 快捷键 + slash」「对话框栈」「主题 token」「事件总线」等概念，将 `box`/`text` 换成 div/span，键盘用 keydown、鼠标用 click。
- **CLI 工具**：可复用 CLI 层的 Style/print/println/error/input 与 Logo 绘制思路，保持输出简洁、错误醒目、必要时同步读入。

如需具体代码片段或某模块的接口列表，可结合本仓库 `packages/opencode/cli/cmd/tui` 与 `packages/opencode/cli/ui.ts` 对照阅读。
