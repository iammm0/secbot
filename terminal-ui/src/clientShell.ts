/**
 * TUI 进程环境（与 Cursor/系统内置终端通常一致），随聊天请求上报供后端写入 system prompt。
 */
export function buildClientShellPayload(): {
  platform: string;
  shell: string;
  comspec: string;
  terminal_profile: string;
} {
  const platform = process.platform;
  const shell = process.env.SHELL ?? "";
  const comspec = process.env.COMSPEC ?? "";

  let terminal_profile: string;
  if (platform === "win32") {
    const c = comspec.toLowerCase();
    if (c.includes("powershell") || c.endsWith("pwsh.exe")) {
      terminal_profile = "Windows · PowerShell（COMSPEC）";
    } else {
      terminal_profile = "Windows · CMD（COMSPEC）";
    }
    if (shell) terminal_profile += `；SHELL=${shell}`;
  } else {
    terminal_profile = shell ? `Unix · ${shell}` : "Unix · 默认登录 shell";
  }

  return { platform, shell, comspec, terminal_profile };
}
