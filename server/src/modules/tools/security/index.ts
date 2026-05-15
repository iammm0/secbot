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
export { DirBruteforceTool } from './dir-bruteforce.tool';
export { WafDetectTool } from './waf-detect.tool';
export { JwtAnalyzeTool } from './jwt-analyze.tool';
export { ParamFuzzerTool } from './param-fuzzer.tool';
export { SsrfDetectTool } from './ssrf-detect.tool';
export { AttackTestTool } from './attack-test.tool';
export { ExploitTool } from './exploit.tool';
export { NmapScanTool } from './nmap-scan.tool';
export { NucleiScanTool } from './nuclei-scan.tool';
export { NiktoScanTool } from './nikto-scan.tool';
export { ScreenshotTool } from './screenshot.tool';
export { CodeAuditTool } from './code-audit.tool';
export { DnsZoneTransferTool } from './dns-zone-transfer.tool';
export { WappalyzerTool } from './wappalyzer.tool';
export { FfufScanTool } from './ffuf-scan.tool';
export { ApiSchemaScanTool } from './api-schema-scan.tool';
export { TracerouteTool } from './traceroute.tool';
export { WifiScanTool } from './wifi-scan.tool';
export { SniffTool } from './sniff.tool';
export { CredentialSprayTool } from './credential-spray.tool';
export { CidrScanTool } from './cidr-scan.tool';

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
import { DirBruteforceTool } from './dir-bruteforce.tool';
import { WafDetectTool } from './waf-detect.tool';
import { JwtAnalyzeTool } from './jwt-analyze.tool';
import { ParamFuzzerTool } from './param-fuzzer.tool';
import { SsrfDetectTool } from './ssrf-detect.tool';
import { AttackTestTool } from './attack-test.tool';
import { ExploitTool } from './exploit.tool';
import { NmapScanTool } from './nmap-scan.tool';
import { NucleiScanTool } from './nuclei-scan.tool';
import { NiktoScanTool } from './nikto-scan.tool';
import { ScreenshotTool } from './screenshot.tool';
import { CodeAuditTool } from './code-audit.tool';
import { DnsZoneTransferTool } from './dns-zone-transfer.tool';
import { WappalyzerTool } from './wappalyzer.tool';
import { FfufScanTool } from './ffuf-scan.tool';
import { ApiSchemaScanTool } from './api-schema-scan.tool';
import { TracerouteTool } from './traceroute.tool';
import { WifiScanTool } from './wifi-scan.tool';
import { SniffTool } from './sniff.tool';
import { CredentialSprayTool } from './credential-spray.tool';
import { CidrScanTool } from './cidr-scan.tool';

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
  new DirBruteforceTool(),
  new WafDetectTool(),
  new JwtAnalyzeTool(),
  new ParamFuzzerTool(),
  new SsrfDetectTool(),
  new AttackTestTool(),
  new ExploitTool(),
  new NmapScanTool(),
  new NucleiScanTool(),
  new NiktoScanTool(),
  new ScreenshotTool(),
  new CodeAuditTool(),
  new DnsZoneTransferTool(),
  new WappalyzerTool(),
  new FfufScanTool(),
  new ApiSchemaScanTool(),
  new TracerouteTool(),
  new WifiScanTool(),
  new SniffTool(),
  new CredentialSprayTool(),
  new CidrScanTool(),
];
