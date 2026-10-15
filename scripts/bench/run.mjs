import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSse, scoreRun, summarize } from './metrics.mjs';

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

const tasksPath = resolve(flag('--tasks', fileURLToPath(new URL('./tasks.example.json', import.meta.url))));
const base = flag('--base', 'http://127.0.0.1:8000').replace(/\/$/, '');
const out = flag('--out', '');
const timeoutMs = Number(flag('--timeout-ms', '120000'));
const jsonOnly = process.argv.includes('--json') || process.argv.includes('--json-only');

const manifest = JSON.parse(await readFile(tasksPath, 'utf8'));
const tasks = Array.isArray(manifest.tasks) ? manifest.tasks : [];
const results = [];

if (!jsonOnly) {
  console.log(`\n=======================================================`);
  console.log(`  Secbot Benchmark Runner (Target: ${base})`);
  console.log(`  Loaded ${tasks.length} tasks from ${tasksPath}`);
  console.log(`=======================================================\n`);
}

for (let i = 0; i < tasks.length; i++) {
  const task = tasks[i];
  const started = Date.now();
  const taskTimeout = Number(task.timeout_ms ?? timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), taskTimeout);

  if (!jsonOnly) {
    const tag = `[${i + 1}/${tasks.length}] [${task.category || 'general'}] ${task.id}`;
    process.stdout.write(`${tag.padEnd(52)} ... `);
  }

  let body = '';
  try {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: String(task.prompt ?? ''),
        session_id: `bench-${task.id}-${started}`,
        mode: 'agent',
        agent: task.agent || 'hackbot',
      }),
      signal: controller.signal,
    });

    if (!response.ok && !response.headers.get('content-type')?.includes('event-stream')) {
      const errText = await response.text();
      body = `event: error\ndata: ${JSON.stringify({ error: errText.slice(0, 500) })}\n\n`;
    } else if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        body += chunk;

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const block of parts) {
          const lines = block.split('\n');
          let event = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (event === 'confirm_required' && dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              if (payload.request_id) {
                fetch(`${base}/api/chat/confirm-response`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    request_id: payload.request_id,
                    action: 'allow',
                    session_id: payload.session_id,
                  }),
                }).catch(() => {});
              }
            } catch {}
          } else if (event === 'ask_user' && dataStr) {
            try {
              const payload = JSON.parse(dataStr);
              if (payload.request_id) {
                fetch(`${base}/api/chat/user-input-response`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    request_id: payload.request_id,
                    selected: payload.options?.slice(0, 1) || ['继续'],
                    session_id: payload.session_id,
                  }),
                }).catch(() => {});
              }
            } catch {}
          }
        }
      }
    }
  } catch (error) {
    body = `event: error\ndata: ${JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })}\n\n`;
  } finally {
    clearTimeout(timer);
  }

  const elapsed = Date.now() - started;
  const score = scoreRun(task, parseSse(body), elapsed);
  results.push(score);

  if (!jsonOnly) {
    const status = score.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const detail = `(${(elapsed / 1000).toFixed(1)}s, ${score.tokens} tok, ${score.tool_rounds} rds)`;
    console.log(`${status} ${detail}`);
  }
}

const summary = summarize(results);
const report = {
  note: manifest.note ?? '只对你拥有或已获得书面授权的环境运行。',
  manifest: tasksPath,
  summary,
  results,
};

if (!jsonOnly) {
  console.log(`\n=======================================================`);
  console.log(`  Benchmark Summary Report`);
  console.log(`=======================================================`);
  console.log(`Total Tasks:       ${summary.total}`);
  console.log(`Passed:            ${summary.passed} (${(summary.pass_at_1 * 100).toFixed(1)}%)`);
  console.log(`Total Tokens:      ${summary.tokens}`);
  console.log(`Tool Iterations:   ${summary.tool_rounds}`);
  console.log(`HITL Prompts:      ${summary.hitl}`);
  console.log(`Local Fallback:    ${summary.fallback_local}`);
  console.log(`Total Elapsed:     ${(summary.elapsed_ms / 1000).toFixed(1)}s`);
  console.log(`-------------------------------------------------------`);
  console.log(`Category Breakdown:`);
  for (const [cat, item] of Object.entries(summary.by_category || {})) {
    const rate = (item.pass_rate * 100).toFixed(1);
    console.log(`  - ${cat.padEnd(22)}: ${item.passed}/${item.total} (${rate}%) | ${item.tokens} tok | ${item.tool_rounds} rds`);
  }
  console.log(`=======================================================\n`);
}

if (out) await writeFile(resolve(out), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (jsonOnly) console.log(JSON.stringify(report, null, 2));

process.exit(summary.total > 0 && summary.passed === summary.total ? 0 : 1);
