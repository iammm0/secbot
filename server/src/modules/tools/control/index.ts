export { ExecuteCommandTool } from './execute-command.tool';
export { TerminalSessionTool } from './terminal-session.tool';
export { InstallToolTool } from './install-tool.tool';

import { BaseTool } from '../core/base-tool';
import { ExecuteCommandTool } from './execute-command.tool';
import { TerminalSessionTool } from './terminal-session.tool';
import { InstallToolTool } from './install-tool.tool';

export const CONTROL_TOOLS: BaseTool[] = [new ExecuteCommandTool(), new TerminalSessionTool(), new InstallToolTool()];
