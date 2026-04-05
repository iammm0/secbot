/**
 * 客户端上报的「用户侧终端」信息，写入 system prompt，使 LLM 生成与用户环境一致的命令。
 */

export interface ClientShellPayload {
  platform?: string;
  shell?: string;
  comspec?: string;
  terminal_profile?: string;
}

export function formatClientShellContextBlock(ctx: ClientShellPayload | undefined | null): string {
  if (!ctx) return '';
  const lines: string[] = [];
  if (ctx.terminal_profile?.trim()) lines.push(`- 配置名/侧写: ${ctx.terminal_profile.trim()}`);
  if (ctx.platform?.trim()) lines.push(`- 平台: ${ctx.platform.trim()}`);
  if (ctx.shell?.trim()) lines.push(`- SHELL: ${ctx.shell.trim()}`);
  if (ctx.comspec?.trim()) lines.push(`- COMSPEC: ${ctx.comspec.trim()}`);
  if (lines.length === 0) return '';

  return (
    `【用户侧终端环境】以下由客户端上报；生成可粘贴执行的命令前必须与之一致；` +
    `若使用工具 execute_command，请注意其在服务端实际通过 ` +
    `${process.platform === 'win32' ? 'cmd.exe /c（CMD 语法）' : '登录 shell 的 -lc（POSIX）'} ` +
    `执行，与 IDE 内置终端可能不同。持久会话请以 terminal_session open 返回的 shell_profile 为准。\n` +
    `${lines.join('\n')}`
  );
}
