import { Injectable } from '@nestjs/common';

export enum EventType {
  PLAN_START = 'plan_start',
  PLAN_TODO = 'plan_todo',
  PLAN_COMPLETE = 'plan_complete',

  THINK_START = 'think_start',
  THINK_CHUNK = 'think_chunk',
  THINK_END = 'think_end',

  EXEC_START = 'exec_start',
  EXEC_PROGRESS = 'exec_progress',
  EXEC_RESULT = 'exec_result',

  CONTENT = 'content',

  REPORT_START = 'report_start',
  REPORT_CHUNK = 'report_chunk',
  REPORT_END = 'report_end',

  TASK_PHASE = 'task_phase',

  CONFIRM_REQUIRED = 'confirm_required',
  ROOT_REQUIRED = 'root_required',

  SESSION_UPDATE = 'session_update',
  ERROR = 'error',

  TOAST_SHOW = 'toast_show',
  COMMAND_EXECUTE = 'command_execute',
}

export interface BusEvent {
  type: EventType;
  data: Record<string, unknown>;
  timestamp: Date;
  iteration: number;
}

export type EventHandler = (event: BusEvent) => void;

@Injectable()
export class EventBus {
  private handlers = new Map<EventType, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();

  subscribe(type: EventType, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  unsubscribe(type: EventType, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  subscribeAll(handler: EventHandler): void {
    this.globalHandlers.add(handler);
  }

  unsubscribeAll(handler: EventHandler): void {
    this.globalHandlers.delete(handler);
  }

  emit(event: BusEvent): void {
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event);
        } catch {
          /* swallow handler errors */
        }
      }
    }
    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch {
        /* swallow handler errors */
      }
    }
  }

  emitSimple(type: EventType, data: Record<string, unknown> = {}, iteration = 0): void {
    this.emit({
      type,
      data,
      timestamp: new Date(),
      iteration,
    });
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}
