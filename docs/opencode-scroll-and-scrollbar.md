# OpenCode 滚动与滚动条实现说明

本文档基于 `opencode/` 参考代码，整理其 TUI 中消息区滚动、滚动条与相关配置的实现方式，供 secbot terminal-ui 对比或借鉴。

---

## 1. 技术栈与组件来源

- **框架**：Solid.js
- **TUI 核心**：`@opentui/core`、`@opentui/solid`
- **滚动相关**：
  - `ScrollBoxRenderable`：滚动容器 ref 类型，提供 `scrollBy`、`scrollTo`、`scrollHeight`、`height`、`y`、`getChildren()` 等
  - `<scrollbox>`：来自 opentui 的滚动容器组件（小写 JSX 标签）
  - `ScrollAcceleration`：滚动加速度/速度策略接口
  - `MacOSScrollAccel`、自定义 `CustomSpeedScroll`：具体策略实现

---

## 2. 会话消息区 scrollbox 用法

**文件**：`opencode/cli/cmd/tui/routes/session/index.tsx`

### 2.1 基本结构

```tsx
<scrollbox
  ref={(r) => (scroll = r)}
  viewportOptions={{
    paddingRight: showScrollbar() ? 1 : 0,
  }}
  verticalScrollbarOptions={{
    paddingLeft: 1,
    visible: showScrollbar(),
    trackOptions: {
      backgroundColor: theme.backgroundElement,
      foregroundColor: theme.border,
    },
  }}
  stickyScroll={true}
  stickyStart="bottom"
  flexGrow={1}
  scrollAcceleration={scrollAcceleration()}
>
  <For each={messages()}>
    {/* 消息列表 */}
  </For>
</scrollbox>
```

要点：

- **ref**：拿到 `ScrollBoxRenderable`，在命令、键盘、同步后滚动等逻辑里调用 `scroll.scrollBy` / `scroll.scrollTo`。
- **viewportOptions.paddingRight**：显示滚动条时给视口右侧留 1 列，避免内容与滚动条重叠。
- **verticalScrollbarOptions**：垂直滚动条是否显示、轨道背景/前景色、左侧留白。
- **stickyScroll + stickyStart="bottom"**：新内容追加时自动贴底（类似“自动滚到底部”）。
- **scrollAcceleration**：见下文“滚动速度/加速度”。

### 2.2 滚动条显隐

- 状态：`const [showScrollbar, setShowScrollbar] = kv.signal("scrollbar_visible", false)`
- 命令：`session.toggle.scrollbar`，标题 "Toggle session scrollbar"，keybind `scrollbar_toggle`
- 配置：keybind 默认 `"none"`（`config/config.ts` 中 `scrollbar_toggle`）

---

## 3. 滚动速度与加速度

### 3.1 配置（config）

**文件**：`opencode/config/config.ts`

- `tui.scroll_speed`：数字，最小 0.001，表示基础滚动速度
- `tui.scroll_acceleration`：`{ enabled: boolean }`，开启则使用“类 macOS”加速度

### 3.2 策略选择（session/index.tsx）

```ts
const scrollAcceleration = createMemo(() => {
  const tui = sync.data.config.tui
  if (tui?.scroll_acceleration?.enabled) {
    return new MacOSScrollAccel()
  }
  if (tui?.scroll_speed) {
    return new CustomSpeedScroll(tui.scroll_speed)
  }
  return new CustomSpeedScroll(3)
})
```

- 优先：加速度开启 → `MacOSScrollAccel`
- 否则：有 `scroll_speed` → `CustomSpeedScroll(tui.scroll_speed)`
- 默认：`CustomSpeedScroll(3)`

### 3.3 CustomSpeedScroll 实现

```ts
class CustomSpeedScroll implements ScrollAcceleration {
  constructor(private speed: number) {}
  tick(_now?: number): number {
    return this.speed
  }
  reset(): void {}
}
```

固定每 tick 返回同一速度，无惯性。

---

## 4. 自动滚到底部

- **会话同步后**：`createEffect` 里 `sync.session.sync(route.sessionID).then(() => { if (scroll) scroll.scrollBy(100_000) })`，用大偏移保证到底。
- **提交输入后**：`Prompt` 的 `onSubmit` 中调用 `toBottom()`：
  - `toBottom()` 内部：`setTimeout(() => { if (!scroll || scroll.isDestroyed) return; scroll.scrollTo(scroll.scrollHeight) }, 50)`

即：拉完会话或发送消息后，延迟 50ms 再执行 `scrollTo(scrollHeight)`，避免渲染未完成时滚动不准。

---

## 5. 键盘与命令：滚动操作

通过 `useCommandDialog().register()` 注册命令，并绑定 keybind，在 `onSelect` 里操作 `scroll`。

| 功能           | 命令 value              | keybind               | 默认键位              | 行为 |
|----------------|-------------------------|------------------------|-----------------------|------|
| 切换滚动条     | session.toggle.scrollbar | scrollbar_toggle       | none                  | setShowScrollbar 取反 |
| 页上           | session.page.up         | messages_page_up       | pageup, ctrl+alt+b    | scroll.scrollBy(-scroll.height / 2) |
| 页下           | session.page.down       | messages_page_down     | pagedown, ctrl+alt+f   | scroll.scrollBy(scroll.height / 2) |
| 行上           | session.line.up         | messages_line_up       | ctrl+alt+y            | scroll.scrollBy(-1) |
| 行下           | session.line.down       | messages_line_down     | ctrl+alt+e            | scroll.scrollBy(1) |
| 半页上         | session.half.page.up   | messages_half_page_up | (hidden)              | scroll.scrollBy(-scroll.height / 4) |
| 半页下         | session.half.page.down | messages_half_page_down | (hidden)            | scroll.scrollBy(scroll.height / 4) |
| 首条消息       | session.first           | messages_first         | (hidden)              | scroll.scrollTo(0) |
| 末条消息       | session.last            | messages_last          | (hidden)              | scroll.scrollTo(scroll.scrollHeight) |
| 上一条消息     | session.message.previous | messages_previous     | (hidden)              | scrollToMessage("prev", dialog) |
| 下一条消息     | session.message.next    | messages_next          | (hidden)              | scrollToMessage("next", dialog) |
| 最后一条用户消息 | session.messages_last_user | messages_last_user   | (hidden)              | 找最后一条 user 消息，getChildren 找对应 child，scrollBy(child.y - scroll.y - 1) |

“上/下一条消息”会先按可见消息边界算 next/prev，再通过 `scroll.getChildren()` 找到对应子节点，用 `scroll.scrollBy(child.y - scroll.y - 1)` 把该消息滚到视口内。

---

## 6. ScrollBoxRenderable API 使用方式

从代码中归纳出的用法（具体以 @opentui/core 为准）：

- **scrollBy(delta: number)**：相对滚动，正数向下，负数向上
- **scrollTo(offset: number)**：绝对滚动到内容偏移，如 0 或 scrollHeight
- **scrollHeight**：内容总高度（可滚动范围）
- **height**：视口高度，用于按“页”滚动（如 height/2、height/4）
- **y**：当前视口对应的内容顶部偏移（相当于 scrollTop）
- **getChildren()**：返回子节点列表，项有 `id`、`y` 等，用于“滚动到某条消息”时定位

“滚动到某条消息”的典型写法：

```ts
const child = scroll.getChildren().find((c) => c.id === messageID)
if (child) scroll.scrollBy(child.y - scroll.y - 1)
```

---

## 7. 其他场景中的 scrollbox

### 7.1 权限/ diff 视图（permission.tsx）

- `<scrollbox height="100%">` 包裹 `<diff>`，仅提供可滚动区域，无滚动条配置描述

### 7.2 侧栏（sidebar.tsx）

- `<scrollbox flexGrow={1}>` 包裹会话列表等，占满剩余高度并可滚动

### 7.3 选择对话框（dialog-select.tsx）

- `<scrollbox scrollbarOptions={{ visible: false }} ref={...} maxHeight={height()}>`，不显示滚动条
- **滚动到当前项**：`moveTo(next, center)` 中根据 `scroll.getChildren()` 找到 `child.id === JSON.stringify(selected()?.value)` 的 target，计算 `y = target.y - scroll.y`：
  - center：`scroll.scrollBy(y - centerOffset)`（居中）
  - 否则：若 `y >= scroll.height` 则 `scroll.scrollBy(y - scroll.height + 1)`；若 `y < 0` 则 `scroll.scrollBy(y)`，首项时再 `scroll.scrollTo(0)`

### 7.4 自动补全（autocomplete.tsx）

- `<scrollbox scrollbarOptions={{ visible: false }}>`，不显示滚动条
- **moveTo**：根据 `scroll.scrollTop`、`viewportHeight`、`scrollBottom` 判断当前选中是否在视口内，用 `scroll.scrollBy(next - scroll.scrollTop)` 或 `scroll.scrollBy(next + 1 - scrollBottom)` 把选中项滚入视口

---

## 8. 与 secbot terminal-ui 的对比（简要）

| 维度           | OpenCode (opentui)                          | secbot terminal-ui (Ink)                    |
|----------------|---------------------------------------------|---------------------------------------------|
| 滚动条         | 组件内置，可显隐，轨道可配主题色             | 自绘字符列（│/█），固定显示在消息区右侧     |
| 自动滚到底部   | stickyScroll + toBottom() 延迟 scrollTo      | useEffect 根据 totalLines 增长更新 scrollOffset |
| 滚动模型       | 组件内部管理，ref 调用 scrollBy/scrollTo    | 自管 scrollOffset + 虚拟列表（按行裁剪块）   |
| 键盘           | 页/半页/行/首/尾/上下一跳，keybind 可配置    | Page Up/Down、↑/↓ 行、点击滚动条跳转        |
| 滚动速度       | scroll_speed + 可选 MacOSScrollAccel         | 无加速度，固定行/页步进                     |
| 滚动到某条消息 | getChildren() 按 id 找 child，scrollBy 到 y | 未实现按消息块跳转                           |

若要在 secbot 中进一步对齐 opencode 行为，可考虑：为“滚动到某条消息”增加按块 id 的跳转、或引入可配置 keybind（如半页、首/尾），并保持当前自绘滚动条与 Ink 的兼容性。
