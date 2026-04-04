export { ShodanQueryTool } from './shodan-query.tool';
export { VirusTotalCheckTool } from './virustotal-check.tool';
export { CertTransparencyTool } from './cert-transparency.tool';
export { CredentialLeakCheckTool } from './credential-leak-check.tool';

import { BaseTool } from '../core/base-tool';
import { ShodanQueryTool } from './shodan-query.tool';
import { VirusTotalCheckTool } from './virustotal-check.tool';
import { CertTransparencyTool } from './cert-transparency.tool';
import { CredentialLeakCheckTool } from './credential-leak-check.tool';

export const OSINT_TOOLS: BaseTool[] = [
  new ShodanQueryTool(),
  new VirusTotalCheckTool(),
  new CertTransparencyTool(),
  new CredentialLeakCheckTool(),
];
