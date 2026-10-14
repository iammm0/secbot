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

const manifest = JSON.parse(await readFile(tasksPath, 'utf8'));
const tasks = Array.isArray(manifest.tasks) ? manifest.tasks : [];
const results = [];

for (const task of tasks) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    body = await response.text();
    if (!response.ok && !body.includes('event:')) {
      body = `event: error\ndata: ${JSON.stringify({ error: body.slice(0, 500) })}\n\n`;
    }
  } catch (error) {
    body = `event: error\ndata: ${JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })}\n\n`;
  } finally {
    clearTimeout(timer);
  }
  results.push(scoreRun(task, parseSse(body), Date.now() - started));
}

const report = {
  note: manifest.note ?? '只对你拥有或已获得书面授权的环境运行。',
  summary: summarize(results),
  results,
};

if (out) await writeFile(resolve(out), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exit(report.summary.total > 0 && report.summary.passed === report.summary.total ? 0 : 1);
