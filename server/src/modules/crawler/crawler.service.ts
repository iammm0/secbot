import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { WebCrawlerTool } from '../tools/crawler/web-crawler.tool';
import { cleanHtmlToText } from '../tools/web-research/html-utils';
import { CrawlerTaskDto } from './dto/crawler.dto';

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

type MonitorTask = {
  id: string;
  url: string;
  interval: number;
  extractor_config?: Record<string, unknown>;
  last_check?: string;
  last_content_hash?: string;
  created_at: string;
};

@Injectable()
export class CrawlerService {
  private readonly tasks = new Map<string, CrawlerTaskDto>();
  private readonly runningTasks = new Map<string, Promise<void>>();
  private readonly monitors = new Map<string, MonitorTask>();
  private readonly monitorEvents: Array<Record<string, unknown>> = [];
  private monitorRunning = false;
  private monitorLoopPromise: Promise<void> | null = null;

  createTask(url: string, crawlerType = 'simple', metadata: Record<string, unknown> = {}): string {
    const id = `${url}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task: CrawlerTaskDto = {
      id,
      url,
      crawler_type: crawlerType,
      status: 'pending',
      created_at: new Date().toISOString(),
      metadata,
    };
    this.tasks.set(id, task);
    return id;
  }

  async executeTask(taskId: string): Promise<Record<string, unknown>> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    if (task.status === 'cancelled') {
      throw new Error(`Task was cancelled: ${taskId}`);
    }

    task.status = 'running';
    const crawler = new WebCrawlerTool();

    try {
      const result = await crawler.run({
        url: task.url,
        crawler_type: task.crawler_type,
        ...(task.metadata ?? {}),
      });

      if (task.status === 'cancelled') {
        return { cancelled: true };
      }

      if (!result.success) {
        task.status = 'failed';
        task.error = result.error ?? 'Crawler execution failed';
        task.completed_at = new Date().toISOString();
        throw new Error(task.error);
      }

      task.status = 'completed';
      task.result = (result.result ?? {}) as Record<string, unknown>;
      task.completed_at = new Date().toISOString();
      return task.result;
    } catch (error) {
      if (task.status !== 'cancelled') {
        task.status = 'failed';
        task.error = (error as Error).message;
        task.completed_at = new Date().toISOString();
      }
      throw error;
    }
  }

  async executeTaskAsync(taskId: string): Promise<void> {
    const promise = this.executeTask(taskId)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.runningTasks.delete(taskId);
      });
    this.runningTasks.set(taskId, promise);
    await promise;
  }

  async executeBatch(urls: string[], crawlerType = 'simple'): Promise<Record<string, unknown>> {
    const taskIds = urls.map((url) => this.createTask(url, crawlerType));
    await Promise.all(taskIds.map(async (taskId) => await this.executeTaskAsync(taskId)));

    const results: Record<string, unknown> = {};
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task?.result) {
        results[taskId] = task.result;
      }
    }
    return results;
  }

  getTask(taskId: string): CrawlerTaskDto | null {
    return this.tasks.get(taskId) ?? null;
  }

  getTaskStatus(taskId: string): TaskStatus | null {
    const task = this.tasks.get(taskId);
    return (task?.status as TaskStatus | undefined) ?? null;
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.status = 'cancelled';
    task.completed_at = new Date().toISOString();
    return true;
  }

  listTasks(): CrawlerTaskDto[] {
    return [...this.tasks.values()];
  }

  addMonitor(url: string, interval = 300, extractorConfig?: Record<string, unknown>): string {
    const id = `${url}_${interval}`;
    this.monitors.set(id, {
      id,
      url,
      interval,
      extractor_config: extractorConfig,
      created_at: new Date().toISOString(),
    });
    return id;
  }

  removeMonitor(taskId: string): boolean {
    return this.monitors.delete(taskId);
  }

  listMonitors(): Array<Record<string, unknown>> {
    return [...this.monitors.values()];
  }

  async checkOnce(taskId: string): Promise<boolean> {
    const task = this.monitors.get(taskId);
    if (!task) return false;
    return await this.checkMonitorTask(task);
  }

  async checkAll(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const task of this.monitors.values()) {
      result[task.id] = await this.checkMonitorTask(task);
    }
    return result;
  }

  async startMonitoring(): Promise<void> {
    if (this.monitorRunning) return;
    this.monitorRunning = true;
    this.monitorLoopPromise = this.monitorLoop();
  }

  async stopMonitoring(): Promise<void> {
    this.monitorRunning = false;
    await this.monitorLoopPromise;
    this.monitorLoopPromise = null;
  }

  listMonitorEvents(): Array<Record<string, unknown>> {
    return [...this.monitorEvents];
  }

  private async monitorLoop(): Promise<void> {
    while (this.monitorRunning) {
      const now = Date.now();
      for (const task of this.monitors.values()) {
        const dueAt = task.last_check
          ? new Date(task.last_check).getTime() + task.interval * 1000
          : 0;
        if (dueAt > now) continue;
        await this.checkMonitorTask(task);
      }
      await this.sleep(1000);
    }
  }

  private async checkMonitorTask(task: MonitorTask): Promise<boolean> {
    try {
      const snapshot = await this.fetchSnapshot(task.url);
      const hash = createHash('md5').update(snapshot).digest('hex');
      let changed = false;

      if (task.last_content_hash && task.last_content_hash !== hash) {
        changed = true;
        const event: Record<string, unknown> = {
          task_id: task.id,
          url: task.url,
          changed: true,
          timestamp: new Date().toISOString(),
        };

        if (task.extractor_config) {
          const crawler = new WebCrawlerTool();
          const extracted = await crawler.run({
            url: task.url,
            extract_info: true,
            extraction_schema: task.extractor_config.schema ?? {},
          });
          event.extracted_info = extracted.success ? extracted.result : { error: extracted.error };
        }

        this.monitorEvents.push(event);
        if (this.monitorEvents.length > 200) {
          this.monitorEvents.shift();
        }
      }

      task.last_content_hash = hash;
      task.last_check = new Date().toISOString();
      return changed;
    } catch {
      task.last_check = new Date().toISOString();
      return false;
    }
  }

  private async fetchSnapshot(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
        signal: controller.signal,
      });
      if (!response.ok) return '';
      const html = await response.text();
      return cleanHtmlToText(html).slice(0, 20_000);
    } finally {
      clearTimeout(timer);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
