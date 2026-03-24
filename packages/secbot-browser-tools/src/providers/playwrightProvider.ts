import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { BrowserToolResult, ToolDefinition, ToolProvider } from "../types.js";

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "browser_open",
    description: "Open a URL in browser session.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
  },
  {
    name: "browser_snapshot",
    description: "Get a lightweight page snapshot.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "browser_click",
    description: "Click element by CSS selector.",
    inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }
  },
  {
    name: "browser_fill",
    description: "Fill value into input by CSS selector.",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string" }, value: { type: "string" } },
      required: ["target", "value"]
    }
  },
  {
    name: "browser_get",
    description: "Get page field: title|url|html|text.",
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

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export class PlaywrightProvider implements ToolProvider {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  listTools(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<BrowserToolResult> {
    try {
      const page = await this.getPage();

      switch (name) {
        case "browser_open": {
          const url = asString(args.url);
          if (!url) return { success: false, error: "url is required" };
          await page.goto(url, { waitUntil: "domcontentloaded" });
          return { success: true, result: { url: page.url() } };
        }
        case "browser_snapshot": {
          const title = await page.title();
          const url = page.url();
          const text = (await page.locator("body").innerText()).slice(0, 4000);
          return { success: true, result: { title, url, text } };
        }
        case "browser_click": {
          const target = asString(args.target);
          if (!target) return { success: false, error: "target is required" };
          await page.click(target);
          return { success: true, result: `clicked: ${target}` };
        }
        case "browser_fill": {
          const target = asString(args.target);
          const value = asString(args.value);
          if (!target || value === undefined) return { success: false, error: "target and value are required" };
          await page.fill(target, value);
          return { success: true, result: `filled: ${target}` };
        }
        case "browser_get": {
          const field = asString(args.field);
          const target = asString(args.target);
          if (!field) return { success: false, error: "field is required" };
          switch (field) {
            case "title":
              return { success: true, result: await page.title() };
            case "url":
              return { success: true, result: page.url() };
            case "html":
              return {
                success: true,
                result: target ? await page.locator(target).innerHTML() : await page.content()
              };
            case "text":
              return {
                success: true,
                result: target ? await page.locator(target).innerText() : await page.locator("body").innerText()
              };
            default:
              return { success: false, error: `unsupported field: ${field}` };
          }
        }
        case "browser_screenshot": {
          const path = asString(args.path);
          if (!path) return { success: false, error: "path is required" };
          await page.screenshot({ path, fullPage: true });
          return { success: true, result: path, artifacts: [path] };
        }
        default:
          return { success: false, error: `unknown tool: ${name}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  private async getPage(): Promise<Page> {
    if (this.page) {
      return this.page;
    }

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    return this.page;
  }
}
