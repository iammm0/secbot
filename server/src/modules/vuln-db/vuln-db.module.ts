import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VulnDbController } from './vuln-db.controller';
import { VulnDbService } from './vuln-db.service';

@Module({
  imports: [ConfigModule],
  controllers: [VulnDbController],
  providers: [VulnDbService],
  exports: [VulnDbService],
})
export class VulnDbModule {}
