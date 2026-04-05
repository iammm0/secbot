/**
 * 执行前校验：命令语法是否与当前真实 shell 环境一致（避免 LLM 按「猜的」终端生成命令）。
 */

export type ShellKind = 'cmd' | 'powershell' | 'posix';

export interface ShellExecutionProfile {
  kind: ShellKind;
  /** 简短标签，如 cmd.exe、powershell、bash */
  label: string;
  /** 给模型/用户的语法提示 */
  hint: string;
}

function profileHints(kind: ShellKind, label: string): string {
  switch (kind) {
    case 'cmd':
      return `当前会话为 Windows CMD（${label}）：使用 dir、find、set/unset 风格变量引用 %VAR%、命令链接用 &；不要使用 PowerShell cmdlet（如 Get-ChildItem、$env:XXX）。`;
    case 'powershell':
      return `当前会话为 PowerShell（${label}）：可使用 Get-ChildItem、$env:XXX、cmdlet 管道；若必须跑 cmd 独占语法可嵌套 cmd /c "..." 。`;
    case 'posix':
      return `当前会话为类 Unix shell（${label}）：使用 ls、grep、find、export VAR=；不要使用 findstr、%VAR% 等典型 cmd 写法。`;
    default:
      return '';
  }
}

export function shellProfile(kind: ShellKind, label: string): ShellExecutionProfile {
  return { kind, label, hint: profileHints(kind, label) };
}

/** 与 ExecuteCommandTool.buildSpawnSpec 一致：Windows 固定 cmd /c；非 Windows 为 login shell -lc */
export function executeCommandShellProfile(): ShellExecutionProfile {
  if (process.platform === 'win32') {
    return shellProfile('cmd', 'cmd.exe (/d /s /c)');
  }
  const sh =
    process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  const base = sh.split(/[/\\]/).pop() ?? sh;
  return shellProfile('posix', `${base} (-lc)`);
}

function looksLikePowerShellCommand(c: string): boolean {
  if (/^\s*(powershell|pwsh)\s/i.test(c)) return false;
  if (/\$env:[A-Za-z_]/i.test(c)) return true;
  if (/\bGet-[A-Za-z][A-Za-z0-9-]*\b/.test(c)) return true;
  if (/\b(Select-Object|Where-Object|ForEach-Object|Write-Host|Out-File|Invoke-Expression)\b/.test(c)) {
    return true;
  }
  return false;
}

function looksLikeCmdExclusive(c: string): boolean {
  if (/^\s*cmd\s/i.test(c)) return false;
  if (/\bfindstr\b/i.test(c)) return true;
  if (/%[A-Za-z0-9_]+%/.test(c)) return true;
  if (/\bwmic\b/i.test(c)) return true;
  return false;
}

function looksLikeWindowsCmdExclusive(c: string): boolean {
  if (/^\s*(cmd|powershell|pwsh)\s/i.test(c)) return false;
  if (/\bfindstr\b/i.test(c)) return true;
  if (/\bwmic\b/i.test(c)) return true;
  if (/%[A-Za-z0-9_]+%/.test(c)) return true;
  return false;
}

/**
 * @returns 错误说明；null 表示未检出明显冲突（仍可能在运行时失败）
 */
export function validateCommandAgainstShell(
  command: string,
  profile: ShellExecutionProfile,
): string | null {
  const c = command.trim();
  if (!c) return null;

  if (profile.kind === 'cmd') {
    if (looksLikePowerShellCommand(c)) {
      return (
        `命令与当前执行环境不符：实际在 ${profile.label} 下执行，但命令疑似 PowerShell。` +
        `请改为 CMD 兼容写法，或先执行 powershell / pwsh 再跑 cmdlet。${profile.hint}`
      );
    }
  }

  if (profile.kind === 'powershell') {
    if (looksLikeCmdExclusive(c)) {
      return (
        `命令与当前执行环境不符：实际在 ${profile.label} 下执行，但命令包含典型 cmd 语法（如 findstr、%VAR%）。` +
        `请改为 PowerShell 写法，或使用 cmd /c "..." 包裹。${profile.hint}`
      );
    }
  }

  if (profile.kind === 'posix') {
    if (looksLikeWindowsCmdExclusive(c)) {
      return (
        `命令与当前执行环境不符：实际在 ${profile.label}（Unix shell）下执行，但命令含典型 Windows cmd 片段。` +
        `请改为 Unix 命令或明确说明跨平台意图。${profile.hint}`
      );
    }
  }

  return null;
}
