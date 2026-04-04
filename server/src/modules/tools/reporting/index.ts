export { ReportGeneratorTool } from './report-generator.tool';

import { BaseTool } from '../core/base-tool';
import { ReportGeneratorTool } from './report-generator.tool';

export const REPORTING_TOOLS: BaseTool[] = [new ReportGeneratorTool()];
