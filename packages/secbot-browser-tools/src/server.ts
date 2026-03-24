import { createInterface } from "node:readline";

import { AgentBrowserProvider } from "./providers/agentBrowserProvider.js";
import { PlaywrightProvider } from "./providers/playwrightProvider.js";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

function writeResult(id: number | string | null | undefined, result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id: number | string | null | undefined, message: string) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`
  );
}

function createProvider() {
  const raw = (process.env.SECBOT_BROWSER_PROVIDER || "agent-browser").trim().toLowerCase();
  if (raw === "playwright") {
    return new PlaywrightProvider();
  }
  return new AgentBrowserProvider();
}

const provider = createProvider();

async function handle(req: JsonRpcRequest) {
  const params = req.params ?? {};
  switch (req.method) {
    case "initialize":
      writeResult(req.id, {
        serverInfo: { name: "secbot-browser-tools", version: "0.1.0" },
        capabilities: { tools: true }
      });
      return;
    case "tools/list":
      writeResult(req.id, { tools: provider.listTools() });
      return;
    case "tools/call": {
      const name = params.name;
      const argumentsObj = params.arguments;
      if (typeof name !== "string") {
        writeError(req.id, "invalid tool name");
        return;
      }
      const args = (argumentsObj && typeof argumentsObj === "object" ? argumentsObj : {}) as Record<string, unknown>;
      const res = await provider.callTool(name, args);
      writeResult(req.id, res);
      return;
    }
    default:
      writeError(req.id, `unsupported method: ${req.method}`);
  }
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async (line: string) => {
  const text = line.trim();
  if (!text) return;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(text) as JsonRpcRequest;
  } catch {
    writeError(null, "invalid json");
    return;
  }
  try {
    await handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeError(req.id, message);
  }
});
