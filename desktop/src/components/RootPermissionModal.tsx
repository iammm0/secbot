import { useMemo, useState } from "react";
import type { RootAction } from "../types";

interface RootPermissionModalProps {
  open: boolean;
  command: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (action: RootAction, password?: string) => void;
}

const ACTIONS: Array<{
  id: RootAction;
  label: string;
  help: string;
  requiresPassword: boolean;
}> = [
  {
    id: "run_once",
    label: "执行一次",
    help: "本次输入密码后执行，不保留策略。",
    requiresPassword: true,
  },
  {
    id: "always_allow",
    label: "总是允许",
    help: "记住允许策略；首次可附带密码继续本次执行。",
    requiresPassword: false,
  },
  {
    id: "deny",
    label: "拒绝",
    help: "取消本次需要提权的操作。",
    requiresPassword: false,
  },
];

export function RootPermissionModal({
  open,
  command,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: RootPermissionModalProps) {
  const [selected, setSelected] = useState<RootAction>("run_once");
  const [password, setPassword] = useState("");

  const selectedMeta = useMemo(
    () => ACTIONS.find((action) => action.id === selected) ?? ACTIONS[0],
    [selected],
  );

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card root-modal">
        <div className="panel-eyebrow">Root Permission</div>
        <h2>需要本机管理员权限</h2>
        <p className="modal-copy">
          后端请求执行一条需要提权的命令。你可以执行一次、记住允许策略，或者直接拒绝。
        </p>
        <div className="root-command">{command}</div>

        <div className="root-actions">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`root-action ${selected === action.id ? "selected" : ""}`}
              onClick={() => setSelected(action.id)}
            >
              <span>{action.label}</span>
              <small>{action.help}</small>
            </button>
          ))}
        </div>

        <label className="modal-field">
          <span>密码（可选）</span>
          <input
            type="password"
            value={password}
            placeholder={
              selectedMeta.requiresPassword
                ? "执行一次时需要输入密码"
                : "总是允许时可留空，下次不再询问"
            }
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="modal-error">{error}</div> : null}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={submitting || (selectedMeta.requiresPassword && !password.trim())}
            onClick={() => onSubmit(selected, password.trim() || undefined)}
          >
            {submitting ? "提交中…" : "继续执行"}
          </button>
        </div>
      </div>
    </div>
  );
}
