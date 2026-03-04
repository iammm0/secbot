export { PortScannerTool } from './port-scanner.tool';
export { ServiceDetectorTool } from './service-detector.tool';
export { VulnScannerTool } from './vuln-scanner.tool';
export { ReconTool } from './recon.tool';
export { DnsLookupTool } from './dns-lookup.tool';
export { WhoisLookupTool } from './whois-lookup.tool';
export { HttpRequestTool } from './http-request.tool';
export { HeaderAnalyzerTool } from './header-analyzer.tool';
export { CorsCheckerTool } from './cors-checker.tool';
export { SslAnalyzerTool } from './ssl-analyzer.tool';
export { SubdomainEnumTool } from './subdomain-enum.tool';
export { TechDetectorTool } from './tech-detector.tool';

import { PortScannerTool } from './port-scanner.tool';
import { ServiceDetectorTool } from './service-detector.tool';
import { VulnScannerTool } from './vuln-scanner.tool';
import { ReconTool } from './recon.tool';
import { DnsLookupTool } from './dns-lookup.tool';
import { WhoisLookupTool } from './whois-lookup.tool';
import { HttpRequestTool } from './http-request.tool';
import { HeaderAnalyzerTool } from './header-analyzer.tool';
import { CorsCheckerTool } from './cors-checker.tool';
import { SslAnalyzerTool } from './ssl-analyzer.tool';
import { SubdomainEnumTool } from './subdomain-enum.tool';
import { TechDetectorTool } from './tech-detector.tool';

export const BASIC_SECURITY_TOOLS = [
  new PortScannerTool(),
  new ServiceDetectorTool(),
  new VulnScannerTool(),
  new ReconTool(),
];

export const ALL_SECURITY_TOOLS = [
  new PortScannerTool(),
  new ServiceDetectorTool(),
  new VulnScannerTool(),
  new ReconTool(),
  new DnsLookupTool(),
  new WhoisLookupTool(),
  new HttpRequestTool(),
  new HeaderAnalyzerTool(),
  new CorsCheckerTool(),
  new SslAnalyzerTool(),
  new SubdomainEnumTool(),
  new TechDetectorTool(),
];
