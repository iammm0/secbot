export { SmartSearchTool } from './smart-search.tool';
export { PageExtractTool } from './page-extract.tool';
export { DeepCrawlTool } from './deep-crawl.tool';
export { ApiClientTool } from './api-client.tool';
export { WebResearchTool } from './web-research.tool';

import { BaseTool } from '../core/base-tool';
import { ApiClientTool } from './api-client.tool';
import { DeepCrawlTool } from './deep-crawl.tool';
import { PageExtractTool } from './page-extract.tool';
import { SmartSearchTool } from './smart-search.tool';
import { WebResearchTool } from './web-research.tool';

export const WEB_RESEARCH_TOOLS: BaseTool[] = [
  new SmartSearchTool(),
  new PageExtractTool(),
  new DeepCrawlTool(),
  new ApiClientTool(),
  new WebResearchTool(),
];
