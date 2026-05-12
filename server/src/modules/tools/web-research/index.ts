export { SmartSearchTool } from './smart-search.tool';
export { PageExtractTool } from './page-extract.tool';
export { DeepCrawlTool } from './deep-crawl.tool';
export { ApiClientTool } from './api-client.tool';
export { WebResearchTool } from './web-research.tool';
export { BrowserSessionTool } from './browser-session.tool';

import { BaseTool } from '../core/base-tool';
import { ApiClientTool } from './api-client.tool';
import { BrowserSessionTool } from './browser-session.tool';
import { DeepCrawlTool } from './deep-crawl.tool';
import { PageExtractTool } from './page-extract.tool';
import { SmartSearchTool } from './smart-search.tool';
import { WebResearchTool } from './web-research.tool';

/** 单例 BrowserSessionTool：跨 chat session 共用同一个工具实例，由参数 session_id 做隔离 */
export const BROWSER_SESSION_TOOL = new BrowserSessionTool();

export const WEB_RESEARCH_TOOLS: BaseTool[] = [
  new SmartSearchTool(),
  new PageExtractTool(),
  new DeepCrawlTool(),
  new ApiClientTool(),
  new WebResearchTool(),
  BROWSER_SESSION_TOOL,
];
