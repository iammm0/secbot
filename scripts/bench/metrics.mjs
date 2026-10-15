export function parseSse(text) {
  const events = [];
  for (const block of String(text).split(/\n\n/)) {
    let event = 'message';
    const dataLines = [];
    for (const line of block.split(/\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) continue;
    const raw = dataLines.join('\n');
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
    events.push({ event, data });
  }
  return events;
}

export function scoreRun(task, events, elapsedMs) {
  const text = events
    .filter((item) => item.event === 'response' || item.event === 'report')
    .map((item) => String(item.data?.content ?? ''))
    .join('\n');
  const pattern = task?.success?.regex ? new RegExp(task.success.regex) : null;
  const usage = [...events].reverse().find((item) => item.event === 'context_usage');
  const fallbackLocal = events.some((item) => {
    const blob = JSON.stringify(item.data ?? {});
    return (
      blob.includes('**执行器** local') ||
      blob.includes('"executor":"local"') ||
      blob.includes('"executor": "local"')
    );
  });
  return {
    id: String(task?.id ?? ''),
    title: String(task?.title ?? task?.id ?? ''),
    category: String(task?.category ?? 'general'),
    passed: pattern ? pattern.test(text) : false,
    tokens: usage ? Number(usage.data?.used_tokens ?? 0) : 0,
    tool_rounds: events.filter((item) => item.event === 'action_start').length,
    elapsed_ms: elapsedMs,
    hitl: events.filter((item) => item.event === 'confirm_required').length,
    fallback_local: fallbackLocal,
  };
}

export function summarize(results) {
  const total = results.length;
  const passed = results.filter((item) => item.passed).length;
  const sum = (key) => results.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);

  const byCategory = {};
  for (const item of results) {
    const cat = item.category || 'general';
    if (!byCategory[cat]) {
      byCategory[cat] = {
        total: 0,
        passed: 0,
        pass_rate: 0,
        tokens: 0,
        tool_rounds: 0,
        elapsed_ms: 0,
      };
    }
    byCategory[cat].total += 1;
    if (item.passed) byCategory[cat].passed += 1;
    byCategory[cat].tokens += Number(item.tokens ?? 0);
    byCategory[cat].tool_rounds += Number(item.tool_rounds ?? 0);
    byCategory[cat].elapsed_ms += Number(item.elapsed_ms ?? 0);
    byCategory[cat].pass_rate =
      byCategory[cat].total > 0 ? byCategory[cat].passed / byCategory[cat].total : 0;
  }

  return {
    total,
    passed,
    pass_at_1: total === 0 ? 0 : passed / total,
    tokens: sum('tokens'),
    tool_rounds: sum('tool_rounds'),
    hitl: sum('hitl'),
    fallback_local: results.filter((item) => item.fallback_local).length,
    elapsed_ms: sum('elapsed_ms'),
    by_category: byCategory,
  };
}
