export { DefenseScanTool } from './defense-scan.tool';
export { SelfVulnScanTool } from './self-vuln-scan.tool';
export { NetworkAnalyzeTool } from './network-analyze.tool';
export { IntrusionDetectTool } from './intrusion-detect.tool';
export { SystemInfoTool } from './system-info.tool';

import { DefenseScanTool } from './defense-scan.tool';
import { SelfVulnScanTool } from './self-vuln-scan.tool';
import { NetworkAnalyzeTool } from './network-analyze.tool';
import { IntrusionDetectTool } from './intrusion-detect.tool';
import { SystemInfoTool } from './system-info.tool';

export const DEFENSE_TOOLS = [
  new DefenseScanTool(),
  new SelfVulnScanTool(),
  new NetworkAnalyzeTool(),
  new IntrusionDetectTool(),
  new SystemInfoTool(),
];
