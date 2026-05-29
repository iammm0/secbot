export { ExecuteCommandTool } from './execute-command.tool';
export { ExecGoActionTool } from './execgo-action.tool';
export { TerminalSessionTool } from './terminal-session.tool';
export { InstallToolTool } from './install-tool.tool';

import { BaseTool } from '../core/base-tool';
import { ExecuteCommandTool } from './execute-command.tool';
import { ExecGoActionTool } from './execgo-action.tool';
import { TerminalSessionTool } from './terminal-session.tool';
import { InstallToolTool } from './install-tool.tool';

export const CONTROL_TOOLS: BaseTool[] = [
  new ExecuteCommandTool(),
  new ExecGoActionTool(),
  new TerminalSessionTool(),
  new InstallToolTool(),
];
