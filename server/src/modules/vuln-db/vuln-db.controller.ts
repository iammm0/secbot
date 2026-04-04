import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { VulnDbService } from './vuln-db.service';
import {
  SearchByScanResultRequestDto,
  SearchNaturalLanguageRequestDto,
  SyncFromSourcesRequestDto,
} from './dto/vuln-db.dto';

@Controller('api/vuln-db')
export class VulnDbController {
  constructor(private readonly vulnDbService: VulnDbService) {}

  @Get('cve/:cveId')
  async searchByCveId(@Param('cveId') cveId: string) {
    const vuln = await this.vulnDbService.search_by_cve_id(cveId);
    if (!vuln) {
      return {
        success: false,
        message: `Vulnerability not found for ${cveId}`,
      };
    }
    return { success: true, vulnerability: vuln };
  }

  @Post('search')
  async searchNaturalLanguage(@Body() body: SearchNaturalLanguageRequestDto) {
    const vulns = await this.vulnDbService.search_natural_language(body.query, body.limit ?? 10);
    return { vulnerabilities: vulns };
  }

  @Post('scan-match')
  async searchByScanResult(@Body() body: SearchByScanResultRequestDto) {
    const mapping = await this.vulnDbService.search_by_scan_result(
      body.scan_result,
      body.limit ?? 5,
    );
    return mapping;
  }

  @Post('sync')
  async syncFromSources(@Body() body: SyncFromSourcesRequestDto) {
    const count = await this.vulnDbService.sync_from_sources(
      body.keywords,
      body.sources,
      body.limit_per_source ?? 50,
    );
    return { success: true, indexed_count: count };
  }

  @Post('clear')
  clearVectors() {
    this.vulnDbService.clear_vectors();
    return { success: true };
  }

  @Get('stats')
  stats() {
    return this.vulnDbService.get_stats();
  }
}
