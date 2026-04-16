/**
 * mouseFilter — 在 Ink 之前拦截终端鼠标滚轮事件
 *
 * 核心思路：将 process.stdin pipe 到 Transform 流，过滤掉 SGR 鼠标转义序列，
 * 使 Ink 只看到干净的键盘输入。滚轮事件通过 EventEmitter 暴露给 React Hook。
 *
 * 用法：
 *   cli.tsx  → initMouseFilter() 获取 filteredStdin 传给 Ink render
 *   组件层   → getMouseEmitter() 获取 emitter 监听 scroll 事件
 */
import { Transform, type TransformCallback } from "node:stream";
import { EventEmitter } from "node:events";

/** SGR 鼠标事件完整正则：ESC [ < btn ; col ; row M/m */
const SGR_MOUSE_RE = /\x1b\[<(\d+);(\d+);(\d+)[Mm]/g;

/** 模块级单例 */
let _emitter: EventEmitter | null = null;
let _cleanup: (() => void) | null = null;

/**
 * 初始化鼠标过滤器，开启 SGR 鼠标追踪。
 * @returns filteredStdin  传给 Ink render({ stdin: filteredStdin })
 */
export function initMouseFilter(): NodeJS.ReadableStream {
  if (!process.stdin.isTTY) return process.stdin;

  const emitter = new EventEmitter();
  _emitter = emitter;

  const transform = new Transform({
    transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
      const str = chunk.toString("utf-8");

      // 解析滚轮事件
      let match: RegExpExecArray | null;
      SGR_MOUSE_RE.lastIndex = 0;
      while ((match = SGR_MOUSE_RE.exec(str)) !== null) {
        const btn = parseInt(match[1], 10);
        if (btn === 64) emitter.emit("scroll", "up");
        else if (btn === 65) emitter.emit("scroll", "down");
      }

      // 移除所有鼠标转义序列，只透传干净数据给 Ink
      const clean = str.replace(SGR_MOUSE_RE, "");
      if (clean.length > 0) {
        this.push(clean);
      }
      callback();
    },
  });

  // 开启 SGR 扩展鼠标追踪（1000=按钮事件, 1006=SGR 编码）
  process.stdout.write("\x1b[?1000h\x1b[?1006h");

  _cleanup = () => {
    process.stdout.write("\x1b[?1000l\x1b[?1006l");
    _emitter = null;
  };

  process.stdin.pipe(transform);
  return transform;
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
