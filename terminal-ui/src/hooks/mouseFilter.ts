/**
 * mouseFilter — 在 Ink 读取 stdin 之前拦截终端鼠标滚轮事件
 *
 * Ink 4 直接通过 `stdin.read()` 消费原始 chunk，而不是监听 `data` / `keypress`。
 * 如果只 patch emit，SGR 鼠标序列仍会原样进入 Ink，并被当作普通输入显示为
 * `[<65;44;25M` 这类残留字符。
 *
 * 因此这里直接 monkey-patch `process.stdin.read()`，在 Ink 看到数据之前：
 * 1. 解析并吞掉 SGR 鼠标序列
 * 2. 将滚轮方向通过 EventEmitter 暴露给 React Hook
 * 3. 仅把净化后的键盘输入继续交给 Ink
 *
 * 之所以不用 Transform 流替换 stdin，是因为 Ink 内部对 process.stdin 有
 * isTTY / setRawMode / fd 等多处依赖，替换后容易导致启动失败。
 */
import { EventEmitter } from "node:events";

type ScrollDirection = "up" | "down";

type ParseResult =
  | { kind: "complete"; nextIndex: number; buttonCode: number }
  | { kind: "incomplete" }
  | { kind: "invalid" };

interface FilterResult {
  clean: string;
  pending: string;
  scrolls: ScrollDirection[];
}

/** 模块级单例 */
let _emitter: EventEmitter | null = null;
let _cleanup: (() => void) | null = null;
let _origRead: Function | null = null;
let _pendingMouseChunk = "";

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function getMousePrefixLength(input: string, index: number): number {
  if (input.startsWith("\x1b[<", index)) return 3;
  if (input.startsWith("[<", index)) return 2;
  return 0;
}

/** X10 / 1000 模式鼠标编码：ESC [ M + 3 字节（>=32） */
function getX10MousePrefixLength(input: string, index: number): number {
  if (input.startsWith("\x1b[M", index)) return 3;
  if (input.startsWith("[M", index)) return 2;
  return 0;
}

function tryParseX10MouseSequence(
  input: string,
  index: number,
): { kind: "complete"; nextIndex: number; buttonCode: number }
  | { kind: "incomplete" }
  | { kind: "invalid" } {
  const prefix = getX10MousePrefixLength(input, index);
  if (prefix === 0) return { kind: "invalid" };
  /** ESC [ M Cb Cx Cy 共需 prefix+3 字节；不足则 incomplete */
  if (index + prefix + 3 > input.length) return { kind: "incomplete" };
  /** 三字节都应 >= 32（实际编码 = byte - 32），否则当作非鼠标序列 */
  for (let i = 0; i < 3; i++) {
    if (input.charCodeAt(index + prefix + i) < 32) return { kind: "invalid" };
  }
  const buttonCode = input.charCodeAt(index + prefix) - 32;
  return { kind: "complete", nextIndex: index + prefix + 3, buttonCode };
}

/** bracketed paste 起止标记：ESC [ 200 ~ / ESC [ 201 ~  */
function getBracketedPasteMarkerLength(input: string, index: number): number {
  if (input.startsWith("\x1b[200~", index)) return 6;
  if (input.startsWith("\x1b[201~", index)) return 6;
  if (input.startsWith("[200~", index)) return 5;
  if (input.startsWith("[201~", index)) return 5;
  return 0;
}

function readNumber(
  input: string,
  index: number,
):
  | { kind: "ok"; nextIndex: number; value: number }
  | { kind: "incomplete" }
  | { kind: "invalid" } {
  if (index >= input.length) return { kind: "incomplete" };
  if (!isDigit(input[index])) return { kind: "invalid" };

  let nextIndex = index;
  while (nextIndex < input.length && isDigit(input[nextIndex])) {
    nextIndex += 1;
  }

  return {
    kind: "ok",
    nextIndex,
    value: Number.parseInt(input.slice(index, nextIndex), 10),
  };
}

function expectChar(
  input: string,
  index: number,
  expected: string,
): { kind: "ok"; nextIndex: number } | { kind: "incomplete" } | { kind: "invalid" } {
  if (index >= input.length) return { kind: "incomplete" };
  if (input[index] !== expected) return { kind: "invalid" };
  return { kind: "ok", nextIndex: index + 1 };
}

function parseSgrMouseSequence(input: string, index: number): ParseResult {
  const prefixLength = getMousePrefixLength(input, index);
  if (prefixLength === 0) return { kind: "invalid" };

  let cursor = index + prefixLength;

  const button = readNumber(input, cursor);
  if (button.kind !== "ok") return button;
  cursor = button.nextIndex;

  const firstSeparator = expectChar(input, cursor, ";");
  if (firstSeparator.kind !== "ok") return firstSeparator;
  cursor = firstSeparator.nextIndex;

  const column = readNumber(input, cursor);
  if (column.kind !== "ok") return column;
  cursor = column.nextIndex;

  const secondSeparator = expectChar(input, cursor, ";");
  if (secondSeparator.kind !== "ok") return secondSeparator;
  cursor = secondSeparator.nextIndex;

  const row = readNumber(input, cursor);
  if (row.kind !== "ok") return row;
  cursor = row.nextIndex;

  if (cursor >= input.length) return { kind: "incomplete" };
  const terminator = input[cursor];
  if (terminator !== "M" && terminator !== "m") return { kind: "invalid" };

  return {
    kind: "complete",
    nextIndex: cursor + 1,
    buttonCode: button.value,
  };
}

function decodeScrollDirection(buttonCode: number): ScrollDirection | null {
  // xterm SGR 鼠标编码中，bit 6 表示滚轮事件；最低两位区分方向：
  // 64/68/... => 上滚，65/69/... => 下滚。
  if ((buttonCode & 64) === 0) return null;

  const wheelCode = buttonCode & 0b11;
  if (wheelCode === 0) return "up";
  if (wheelCode === 1) return "down";
  return null;
}

export function filterMouseInputChunk(raw: string, carry = ""): FilterResult {
  const input = carry + raw;
  const scrolls: ScrollDirection[] = [];
  let clean = "";
  let index = 0;

  while (index < input.length) {
    // 1) bracketed paste 起止标记：直接吞掉（保留中间的真实粘贴文本）
    const pasteMarkerLen = getBracketedPasteMarkerLength(input, index);
    if (pasteMarkerLen > 0) {
      index += pasteMarkerLen;
      continue;
    }
    /** 不完整的 bracketed paste 起始（ESC [ + 部分数字 + ~）：留到下一轮 */
    if (
      (input.startsWith("\x1b[", index) || input.startsWith("[", index)) &&
      isPartialBracketedPaste(input, index)
    ) {
      return { clean, pending: input.slice(index), scrolls };
    }

    // 2) SGR 鼠标序列 ESC [ < args [Mm]
    const sgrPrefixLength = getMousePrefixLength(input, index);
    if (sgrPrefixLength > 0) {
      const parsed = parseSgrMouseSequence(input, index);
      if (parsed.kind === "complete") {
        const direction = decodeScrollDirection(parsed.buttonCode);
        if (direction) scrolls.push(direction);
        index = parsed.nextIndex;
        continue;
      }
      if (parsed.kind === "incomplete") {
        return { clean, pending: input.slice(index), scrolls };
      }
      /** invalid：按单字符回退，避免误吞合法输入 */
      clean += input[index];
      index += 1;
      continue;
    }

    // 3) X10/1000 鼠标编码 ESC [ M + 3 字节
    const x10PrefixLength = getX10MousePrefixLength(input, index);
    if (x10PrefixLength > 0) {
      const parsed = tryParseX10MouseSequence(input, index);
      if (parsed.kind === "complete") {
        /** X10 编码中按钮 64/65 表示滚轮上/下 */
        if (parsed.buttonCode === 64) scrolls.push("up");
        else if (parsed.buttonCode === 65) scrolls.push("down");
        index = parsed.nextIndex;
        continue;
      }
      if (parsed.kind === "incomplete") {
        return { clean, pending: input.slice(index), scrolls };
      }
      clean += input[index];
      index += 1;
      continue;
    }

    clean += input[index];
    index += 1;
  }

  return { clean, pending: "", scrolls };
}

/** 判断 input[index..] 是否可能是不完整的 bracketed paste 标记 */
function isPartialBracketedPaste(input: string, index: number): boolean {
  const rest = input.slice(index, index + 6);
  return /^(\x1b\[?|\[)2(0(0|1)?)?~?$/.test(rest);
}

/**
 * 初始化鼠标过滤器：
 * 1. 开启 SGR 鼠标追踪
 * 2. 拦截 stdin.read()，过滤鼠标转义序列
 *
 * 必须在 Ink render() 之前调用。
 */
export function initMouseFilter(): void {
  if (!process.stdin.isTTY) return;
  if (_emitter) return; // 防止重复初始化

  const emitter = new EventEmitter();
  _emitter = emitter;
  _pendingMouseChunk = "";

  // 保存原始 read；Ink 通过 readable + read() 读取原始输入。
  _origRead = process.stdin.read.bind(process.stdin);

  process.stdin.read = function patchedRead(...args: any[]): string | Buffer | null {
    while (true) {
      const chunk = _origRead!(...args) as string | Buffer | null;
      if (chunk == null) {
        return null;
      }

      const raw =
        typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);

      const { clean, pending, scrolls } = filterMouseInputChunk(raw, _pendingMouseChunk);
      _pendingMouseChunk = pending;

      for (const direction of scrolls) {
        emitter.emit("scroll", direction);
      }

      if (clean.length === 0) {
        // 当前 read() 只拿到了鼠标序列，继续尝试读取下一个 chunk，
        // 避免 Ink 因 null 提前结束本轮 readable 消费。
        continue;
      }

      if (typeof chunk === "string") return clean;
      return Buffer.from(clean, "utf8");
    }
  } as any;

  // 开启 SGR 扩展鼠标追踪（1000=按钮事件, 1006=SGR 编码）
  // 显式关闭 bracketed paste（?2004），避免粘贴标记残片污染输入框
  process.stdout.write("\x1b[?1000h\x1b[?1006h\x1b[?2004l");

  _cleanup = () => {
    // 关闭鼠标追踪
    process.stdout.write("\x1b[?1000l\x1b[?1006l");
    // 恢复原始 read
    if (_origRead) {
      process.stdin.read = _origRead as any;
      _origRead = null;
    }
    _pendingMouseChunk = "";
    _emitter = null;
  };
}

/**
 * 输入框兜底清洗：剥掉任何到达 TextInput.onChange 的 ANSI 控制残片。
 *
 * 设计取舍：用比较宽松的 CSI 正则吃掉 "ESC [ ... 终止符"；
 * 单独的 ESC 字符也吃掉（已没用，IME 不会输入 ESC）。
 * 对于鼠标残骸常见形态 "<\d+;\d+;\d+[Mm]" 单独处理（不会误伤普通 < > 字符）。
 */
export function sanitizeInputValue(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/\x1b\[[\d;<>?]*[ -/]*[@-~]/g, "")
    .replace(/<\d+;\d+;\d+[Mm]/g, "")
    .replace(/\x1b\[200~/g, "")
    .replace(/\x1b\[201~/g, "")
    .replace(/\x1b/g, "");
}

/** 获取滚轮事件 emitter（组件层调用） */
export function getMouseEmitter(): EventEmitter | null {
  return _emitter;
}

/** 关闭鼠标追踪并清理 */
export function cleanupMouseFilter(): void {
  _cleanup?.();
  _cleanup = null;
}
