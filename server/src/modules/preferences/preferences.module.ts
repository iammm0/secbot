import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
