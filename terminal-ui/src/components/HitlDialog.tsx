/**
 * HITL 审批弹窗 — 敏感操作批准（confirm_required）与 ask_user 决策
 * （user_input_required），回复后交给后端继续 agent 循环。
 */
import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { isInkEscape } from "../contexts/KeybindContext.js";
import { useTheme } from "../contexts/ThemeContext.js";
import { api } from "../api/api.js";
import type {
  PendingConfirmRequest,
  PendingHitlRequest,
  PendingUserInputRequest,
} from "../chat/types.js";

type ConfirmAction = "allow" | "deny" | "always_allow";

interface HitlDialogProps {
  request: PendingHitlRequest;
  onResolve: () => void;
}

export function HitlDialog({ request, onResolve }: HitlDialogProps) {
  if (request.kind === "confirm") {
    return <ConfirmBody request={request} onResolve={onResolve} />;
  }
  return <DecisionBody request={request} onResolve={onResolve} />;
}

// ── 敏感操作批准 ───────────────────────────────────────────────────────────────

function ConfirmBody({
  request,
  onResolve,
}: {
  request: PendingConfirmRequest;
  onResolve: () => void;
}) {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const paramsPreview = useMemo(() => {
    try {
      return JSON.stringify(request.params ?? {}, null, 2);
    } catch {
      return String(request.params ?? "");
    }
  }, [request.params]);

  const submit = async (action: ConfirmAction) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/chat/confirm-response", {
        request_id: request.request_id,
        action,
        session_id: request.session_id,
      });
      onResolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      submit("deny");
      return;
    }
    if (input === "1") submit("allow");
    else if (input === "2") submit("always_allow");
    else if (input === "3") submit("deny");
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.warning}>
        敏感操作批准 · {request.tool || "未知工具"}
      </Text>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>请求执行：</Text>
      </Box>
      <Box>
        <Text color={theme.text} wrap="truncate">
          {request.tool}
        </Text>
      </Box>
      {request.risk_summary ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted} wrap="truncate">
            {request.risk_summary}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.textMuted} dimColor wrap="truncate">
          参数：{paramsPreview}
        </Text>
      </Box>
      <Box marginTop={2}>
        <Text color={theme.text}>请选择：</Text>
      </Box>
      <Box>
        <Text>  [1] 批准一次</Text>
      </Box>
      <Box>
        <Text>  [2] 本会话始终允许</Text>
      </Box>
      <Box>
        <Text>  [3] 拒绝</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>按 1/2/3 选择，Esc 拒绝</Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.error}>{error}</Text>
        </Box>
      )}
      {submitting && (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>提交中…</Text>
        </Box>
      )}
    </Box>
  );
}

// ── ask_user 决策 ─────────────────────────────────────────────────────────────

function DecisionBody({
  request,
  onResolve,
}: {
  request: PendingUserInputRequest;
  onResolve: () => void;
}) {
  const theme = useTheme();
  const textOnly = request.input_type === "text";
  const multi = request.input_type === "multi_select";
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [focus, setFocus] = useState<"options" | "text">(
    textOnly ? "text" : "options",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (payload: { selected: string[]; text: string }) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/chat/user-input-response", {
        request_id: request.request_id,
        selected: payload.selected,
        text: payload.text,
        session_id: request.session_id,
      });
      onResolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      if (focus === "text" && !textOnly) {
        setFocus("options");
        return;
      }
      submit({ selected: [], text: "" });
      return;
    }
    if (focus === "text") {
      if (key.tab && !textOnly) {
        setFocus("options");
      }
      return;
    }
    // focus === "options"
    if (key.tab) {
      if (request.allow_free_text) setFocus("text");
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(Math.max(0, request.options.length - 1), c + 1));
      return;
    }
    if (input === " ") {
      const opt = request.options[cursor];
      if (!opt) return;
      setSelected((prev) => {
        if (multi) {
          return prev.includes(opt.id)
            ? prev.filter((x) => x !== opt.id)
            : [...prev, opt.id];
        }
        return [opt.id];
      });
      return;
    }
    if (key.return) {
      if (multi) {
        submit({ selected, text });
        return;
      }
      const opt = request.options[cursor];
      submit({ selected: opt ? [opt.id] : [], text });
      return;
    }
  });

  const handleTextSubmit = () => submit({ selected, text: text.trim() });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>
        需要你的决策
      </Text>
      <Box marginTop={1}>
        <Text color={theme.text} wrap="truncate">
          {request.prompt}
        </Text>
      </Box>
      {!textOnly && request.options.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {request.options.map((opt, index) => {
            const active = selected.includes(opt.id);
            const isCursor = focus === "options" && index === cursor;
            const marker = multi
              ? active
                ? "☑"
                : "☐"
              : active
                ? "●"
                : "○";
            return (
              <Text
                key={opt.id}
                color={
                  active ? theme.primary : isCursor ? theme.text : theme.textMuted
                }
                bold={active}
              >
                {`${isCursor ? "▸" : " "} ${marker} ${opt.label}`}
              </Text>
            );
          })}
        </Box>
      ) : null}
      {textOnly || request.allow_free_text ? (
        <Box marginTop={1} flexDirection="row">
          <Text color={theme.secondary} bold>
            {"> "}
          </Text>
          <TextInput
            value={text}
            onChange={setText}
            onSubmit={handleTextSubmit}
            placeholder={textOnly ? "请描述你的决定…" : "可选：补充说明…"}
            focus={focus === "text"}
          />
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>
          {textOnly
            ? "Enter 提交 · Esc 跳过"
            : multi
              ? "↑/↓ 移动 · 空格 选择 · Enter 提交 · Esc 跳过"
              : "↑/↓ 移动 · Enter 提交 · Esc 跳过"}
          {!textOnly && request.allow_free_text ? " · Tab 输入补充" : ""}
        </Text>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.error}>{error}</Text>
        </Box>
      )}
      {submitting && (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>提交中…</Text>
        </Box>
      )}
    </Box>
  );
}
