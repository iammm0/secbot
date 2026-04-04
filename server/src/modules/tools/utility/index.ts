export { HashTool } from './hash.tool';
export { EncodeDecodeTool } from './encode-decode.tool';
export { IpGeoTool } from './ip-geolocation.tool';
export { FileAnalyzeTool } from './file-analyze.tool';
export { CveLookupTool } from './cve-lookup.tool';
export { LogAnalyzeTool } from './log-analyze.tool';
export { PasswordAuditTool } from './password-audit.tool';
export { SecretScannerTool } from './secret-scanner.tool';
export { DependencyAuditTool } from './dependency-audit.tool';
export { PayloadGeneratorTool } from './payload-generator.tool';

import { BaseTool } from '../core/base-tool';
import { HashTool } from './hash.tool';
import { EncodeDecodeTool } from './encode-decode.tool';
import { IpGeoTool } from './ip-geolocation.tool';
import { FileAnalyzeTool } from './file-analyze.tool';
import { CveLookupTool } from './cve-lookup.tool';
import { LogAnalyzeTool } from './log-analyze.tool';
import { PasswordAuditTool } from './password-audit.tool';
import { SecretScannerTool } from './secret-scanner.tool';
import { DependencyAuditTool } from './dependency-audit.tool';
import { PayloadGeneratorTool } from './payload-generator.tool';

export const UTILITY_TOOLS: BaseTool[] = [
  new HashTool(),
  new EncodeDecodeTool(),
  new IpGeoTool(),
  new FileAnalyzeTool(),
  new CveLookupTool(),
  new LogAnalyzeTool(),
  new PasswordAuditTool(),
  new SecretScannerTool(),
  new DependencyAuditTool(),
  new PayloadGeneratorTool(),
];

