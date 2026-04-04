export { ExecuteCommandTool } from './execute-command.tool';
export { TerminalSessionTool } from './terminal-session.tool';

import { BaseTool } from '../core/base-tool';
import { ExecuteCommandTool } from './execute-command.tool';
import { TerminalSessionTool } from './terminal-session.tool';

export const CONTROL_TOOLS: BaseTool[] = [new ExecuteCommandTool(), new TerminalSessionTool()];
