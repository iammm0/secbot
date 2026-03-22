import { BASE_URL } from "../config";
import type { SSEEvent } from "../types";

export interface SSECallbacks {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

function parseSSESegment(segment: string): { event: string; data: string } | null {
  const lines = segment.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  return { event, data };
}

function normalizeSSEText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

const CONNECTION_TIMEOUT_MS = 15000;

export function connectSSE(
  path: string,
  body: unknown,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();
  const url = `${BASE_URL}${path}`;
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearConnectionTimeout = () => {
    if (connectionTimeoutId != null) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }
  };

  void (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`SSE HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      let hasDoneEvent = false;

      const emitParsedEvent = (eventName: string, rawData: string) => {
        try {
          const parsedData = JSON.parse(rawData) as Record<string, unknown>;
          callbacks.onEvent({ event: eventName, data: parsedData });
        } catch {
          callbacks.onEvent({ event: eventName, data: { raw: rawData } });
        }
        if (eventName === "done" && !hasDoneEvent) {
          hasDoneEvent = true;
          callbacks.onDone?.();
        }
      };

      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        let hasReceivedEvent = false;

        connectionTimeoutId = setTimeout(() => {
          if (hasReceivedEvent) return;
          controller.abort();
          callbacks.onError?.(
            new Error("连接超时，请确认后端已在 127.0.0.1:8000 启动"),
          );
        }, CONNECTION_TIMEOUT_MS);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const normalized = normalizeSSEText(buffer);
          const parts = normalized.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const segment of parts) {
            const parsed = parseSSESegment(segment);
            if (!parsed) continue;
            hasReceivedEvent = true;
            clearConnectionTimeout();
            emitParsedEvent(parsed.event, parsed.data);
          }
        }

        if (buffer.trim()) {
          const parsed = parseSSESegment(buffer);
          if (parsed) {
            emitParsedEvent(parsed.event, parsed.data);
          }
        }

        clearConnectionTimeout();
        if (!hasDoneEvent) callbacks.onDone?.();
      } else {
        const fullText = await response.text();
        const normalized = normalizeSSEText(fullText);
        for (const segment of normalized.split("\n\n")) {
          const parsed = parseSSESegment(segment);
          if (parsed) emitParsedEvent(parsed.event, parsed.data);
        }
        if (!hasDoneEvent) callbacks.onDone?.();
      }
    } catch (error: unknown) {
      clearConnectionTimeout();
      const err = error as { name?: string };
      if (err.name !== "AbortError") {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  })();

  return controller;
}
