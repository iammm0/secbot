import { spawn } from "node:child_process";
import process from "node:process";

import type { BrowserToolResult, ToolDefinition, ToolProvider } from "../types.js";

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "browser_open",
    description: "Open a URL in browser session.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
  },
  {
    name: "browser_snapshot",
    description: "Get page snapshot.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "browser_click",
    description: "Click element by selector/ref.",
    inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
  },
  {
    name: "browser_fill",
    description: "Fill value to input by selector/ref.",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string" }, value: { type: "string" } },
      required: ["target", "value"]
    }
  },
  {
    name: "browser_get",
    description: "Get text/title/html using agent-browser get.",
    inputSchema: {
      type: "object",
      properties: { field: { type: "string" }, target: { type: "string" } },
      required: ["field"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Take screenshot to path.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  }
];

function binName(): string {
  return process.platform === "win32" ? "agent-browser.cmd" : "agent-browser";
}

async function runCommand(args: string[], timeoutMs = 45000): Promise<BrowserToolResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(binName(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        error: `agent-browser timeout after ${timeoutMs}ms`,
        elapsedMs: Date.now() - started
      });
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: `failed to spawn agent-browser: ${err.message}`,
        elapsedMs: Date.now() - started
      });
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr.trim() || `agent-browser exited with code ${code}`,
          result: stdout.trim(),
          elapsedMs: Date.now() - started
        });
        return;
      }
      resolve({
        success: true,
        result: stdout.trim(),
        error: stderr.trim(),
        elapsedMs: Date.now() - started
      });
    });
  });
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export class AgentBrowserProvider implements ToolProvider {
  listTools(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<BrowserToolResult> {
    switch (name) {
      case "browser_open": {
        const url = asString(args.url);
        if (!url) return { success: false, error: "url is required" };
        return runCommand(["open", url]);
      }
      case "browser_snapshot":
        return runCommand(["snapshot", "-i"]);
      case "browser_click": {
        const target = asString(args.target);
        if (!target) return { success: false, error: "target is required" };
        return runCommand(["click", target]);
      }
      case "browser_fill": {
        const target = asString(args.target);
        const value = asString(args.value);
        if (!target || value === undefined) return { success: false, error: "target and value are required" };
        return runCommand(["fill", target, value]);
      }
      case "browser_get": {
        const field = asString(args.field);
        const target = asString(args.target);
        if (!field) return { success: false, error: "field is required" };
        return target ? runCommand(["get", field, target]) : runCommand(["get", field]);
      }
      case "browser_screenshot": {
        const path = asString(args.path);
        if (!path) return { success: false, error: "path is required" };
        return runCommand(["screenshot", path]);
      }
      default:
        return { success: false, error: `unknown tool: ${name}` };
    }
  }
}
