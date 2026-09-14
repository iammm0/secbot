export { McpCallTool } from './mcp-call.tool';

import { PreferencesService } from '../../preferences/preferences.service';
import { BaseTool } from '../core/base-tool';
import { McpCallTool } from './mcp-call.tool';

export function createMcpTools(preferences: PreferencesService): BaseTool[] {
  return [new McpCallTool(preferences)];
}
