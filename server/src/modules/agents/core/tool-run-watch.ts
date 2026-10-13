import type { ToolProgress, ToolProgressCallback } from '../../tools/core/base-tool';

const QUIET_AFTER_MS = 20_000;
const STUCK_AFTER_MS = 60_000;
const HEARTBEAT_MS = 5_000;

export function classifyToolWait(ageMs: number): Pick<ToolProgress, 'status' | 'message' | 'hint'> {
  if (ageMs >= STUCK_AFTER_MS) {
    return {
      status: 'possibly_stuck',
      message: '较长时间没有新的结果',
      hint: '任务可能卡住了。可以继续等，或暂停后缩小范围再试。',
    };
  }
  if (ageMs >= QUIET_AFTER_MS) {
    return {
      status: 'quiet',
      message: '暂时没有新输出',
      hint: '进程还在，扫描和远程命令经常会安静一会儿。',
    };
  }
  return {
    status: 'running',
    message: '任务正在进行',
    hint: '已开始计时，有新结果时会继续更新。',
  };
}

/** 工具执行期间按沉默时长上报计时。工具自己的进度会刷新“最后有结果”的时间。 */
export async function observeToolRun<T>(
  emit: (progress: ToolProgress) => void,
  run: (onProgress: ToolProgressCallback) => Promise<T>,
): Promise<T> {
  const started = Date.now();
  let lastOutputAt = started;
  let lastProgress: ToolProgress = {
    ...classifyToolWait(0),
    elapsed_ms: 0,
    last_output_age_ms: 0,
  };

  const publish = (progress: ToolProgress) => {
    lastProgress = {
      ...lastProgress,
      ...progress,
      elapsed_ms: progress.elapsed_ms ?? Date.now() - started,
      last_output_age_ms: progress.last_output_age_ms ?? Date.now() - lastOutputAt,
    };
    emit(lastProgress);
  };

  publish(lastProgress);
  const timer = setInterval(() => {
    const age = Date.now() - lastOutputAt;
    const waited = classifyToolWait(age);
    const keepToolDetail = waited.status === 'running' || waited.status === lastProgress.status;
    publish({
      ...lastProgress,
      status: waited.status,
      elapsed_ms: Date.now() - started,
      last_output_age_ms: age,
      message: keepToolDetail ? lastProgress.message || waited.message : waited.message,
      hint: keepToolDetail ? lastProgress.hint || waited.hint : waited.hint,
    });
  }, HEARTBEAT_MS);

  try {
    return await run((progress) => {
      if (progress.status === 'running' || progress.status === 'done') {
        lastOutputAt = Date.now();
      }
      publish(progress);
    });
  } finally {
    clearInterval(timer);
  }
}
