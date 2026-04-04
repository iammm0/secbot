import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import {
  AddMonitorRequestDto,
  CreateCrawlTaskRequestDto,
  ExecuteBatchRequestDto,
} from './dto/crawler.dto';

@Controller('api/crawler')
export class CrawlerController {
  constructor(private readonly crawlerService: CrawlerService) {}

  @Post('tasks')
  createTask(@Body() body: CreateCrawlTaskRequestDto) {
    const taskId = this.crawlerService.createTask(
      body.url,
      body.crawler_type ?? 'simple',
      (body.metadata ?? {}) as Record<string, unknown>,
    );
    return { success: true, task_id: taskId };
  }

  @Get('tasks')
  listTasks() {
    return { tasks: this.crawlerService.listTasks() };
  }

  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string) {
    const task = this.crawlerService.getTask(taskId);
    if (!task) return { success: false, error: `Task not found: ${taskId}` };
    return { success: true, task };
  }

  @Get('tasks/:taskId/status')
  getTaskStatus(@Param('taskId') taskId: string) {
    const status = this.crawlerService.getTaskStatus(taskId);
    if (!status) return { success: false, error: `Task not found: ${taskId}` };
    return { success: true, status };
  }

  @Post('tasks/:taskId/execute')
  async executeTask(@Param('taskId') taskId: string) {
    try {
      const result = await this.crawlerService.executeTask(taskId);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  @Post('tasks/:taskId/execute-async')
  async executeTaskAsync(@Param('taskId') taskId: string) {
    await this.crawlerService.executeTaskAsync(taskId);
    return { success: true };
  }

  @Post('tasks/:taskId/cancel')
  cancelTask(@Param('taskId') taskId: string) {
    const ok = this.crawlerService.cancelTask(taskId);
    return ok ? { success: true } : { success: false, error: `Task not found: ${taskId}` };
  }

  @Post('batch')
  async executeBatch(@Body() body: ExecuteBatchRequestDto) {
    const urls = Array.isArray(body.urls) ? body.urls : [];
    const result = await this.crawlerService.executeBatch(urls, body.crawler_type ?? 'simple');
    return { success: true, results: result };
  }

  @Post('monitors')
  addMonitor(@Body() body: AddMonitorRequestDto) {
    const monitorId = this.crawlerService.addMonitor(
      body.url,
      body.interval ?? 300,
      body.extractor_config as Record<string, unknown> | undefined,
    );
    return { success: true, monitor_id: monitorId };
  }

  @Get('monitors')
  listMonitors() {
    return {
      monitors: this.crawlerService.listMonitors(),
      events: this.crawlerService.listMonitorEvents(),
    };
  }

  @Post('monitors/:monitorId/check')
  async checkMonitor(@Param('monitorId') monitorId: string) {
    const changed = await this.crawlerService.checkOnce(monitorId);
    return { success: true, changed };
  }

  @Post('monitors/check-all')
  async checkAllMonitors() {
    const changedMap = await this.crawlerService.checkAll();
    return { success: true, changed: changedMap };
  }

  @Post('monitors/start')
  async startMonitors() {
    await this.crawlerService.startMonitoring();
    return { success: true };
  }

  @Post('monitors/stop')
  async stopMonitors() {
    await this.crawlerService.stopMonitoring();
    return { success: true };
  }

  @Post('monitors/:monitorId/remove')
  removeMonitor(@Param('monitorId') monitorId: string) {
    const ok = this.crawlerService.removeMonitor(monitorId);
    return ok ? { success: true } : { success: false, error: `Monitor not found: ${monitorId}` };
  }
}
