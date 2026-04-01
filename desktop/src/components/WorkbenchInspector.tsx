import type { RenderBlock } from "../types";

const PHASE_LABELS: Record<string, string> = {
  idle: "空闲",
  planning: "规划中",
  thinking: "推理中",
  exec: "执行工具",
  report: "生成报告中",
  done: "完成",
};

interface WorkbenchInspectorProps {
  blocks: RenderBlock[];
  streaming: boolean;
  currentPhase: string;
}

function summarizeBlocks(blocks: RenderBlock[]) {
  const counters = new Map<string, number>();
  for (const block of blocks) {
    counters.set(block.type, (counters.get(block.type) ?? 0) + 1);
  }
  return Array.from(counters.entries()).sort((a, b) => b[1] - a[1]);
}

export function WorkbenchInspector({
  blocks,
  streaming,
  currentPhase,
}: WorkbenchInspectorProps) {
  const blockSummary = summarizeBlocks(blocks).slice(0, 6);
  const lastTool = [...blocks]
    .reverse()
    .find((block) => block.type === "execution" || block.type === "exec_result");
  const lastReport = [...blocks].reverse().find((block) => block.type === "report");
  const lastError = [...blocks].reverse().find((block) => block.type === "error");
  const lastPlanning = [...blocks].reverse().find((block) => block.type === "planning");

  return (
    <aside className="inspector">
      <div className="panel-card inspector-card">
        <div className="panel-eyebrow">Inspector</div>
        <h3>当前任务状态</h3>
        <div className="inspector-stat-grid">
          <div className="inspector-stat">
            <span>Phase</span>
            <strong>{PHASE_LABELS[currentPhase] ?? currentPhase}</strong>
          </div>
          <div className="inspector-stat">
            <span>流式状态</span>
            <strong>{streaming ? "运行中" : "待机"}</strong>
          </div>
          <div className="inspector-stat">
            <span>消息块</span>
            <strong>{blocks.length}</strong>
          </div>
          <div className="inspector-stat">
            <span>最后工具</span>
            <strong>{lastTool?.tool ?? "无"}</strong>
          </div>
        </div>
      </div>

      <div className="panel-card inspector-card">
        <div className="panel-eyebrow">Timeline</div>
        <h3>块统计</h3>
        <div className="metric-list">
          {blockSummary.length === 0 ? (
            <div className="metric-row muted">还没有产生消息块</div>
          ) : (
            blockSummary.map(([type, count]) => (
              <div key={type} className="metric-row">
                <span>{type}</span>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel-card inspector-card">
        <div className="panel-eyebrow">Planning</div>
        <h3>最近规划</h3>
        <p className="inspector-preview">
          {lastPlanning?.content?.trim() || "当前还没有规划内容。"}
        </p>
      </div>

      <div className="panel-card inspector-card">
        <div className="panel-eyebrow">Report</div>
        <h3>报告摘要</h3>
        <p className="inspector-preview">
          {lastReport?.content?.trim() || "报告生成后会在这里展示预览。"}
        </p>
      </div>

      <div className="panel-card inspector-card danger">
        <div className="panel-eyebrow">Errors</div>
        <h3>最近错误</h3>
        <p className="inspector-preview">
          {lastError?.error?.trim() || "暂无错误。"}
        </p>
      </div>
    </aside>
  );
}
