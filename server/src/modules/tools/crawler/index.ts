export { WebCrawlerTool } from './web-crawler.tool';

import { BaseTool } from '../core/base-tool';
import { WebCrawlerTool } from './web-crawler.tool';

export const CRAWLER_TOOLS: BaseTool[] = [new WebCrawlerTool()];
