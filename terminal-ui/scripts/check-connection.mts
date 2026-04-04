/**
 * TS TUI connectivity check: validate backend and basic /api/chat stream response.
 * Usage: cd terminal-ui && node --import tsx scripts/check-connection.mts
 */
const BASE = process.env.SECBOT_API_URL ?? process.env.BASE_URL ?? 'http://localhost:8000';

async function check() {
  console.log('Checking backend:', BASE);
  const infoRes = await fetch(`${BASE}/api/system/info`).catch(() => null);
  if (!infoRes?.ok) {
    console.error('Backend is not ready. Start it with: npm run start');
    process.exit(1);
  }
  console.log('Backend OK');

  console.log('Requesting POST /api/chat (message=hi)...');
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hi', mode: 'agent' }),
  });
  if (!res.ok) {
    console.error('POST /api/chat failed:', res.status, await res.text());
    process.exit(1);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    console.error('Missing response.body');
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let gotEvent = false;
  const norm = (s: string) => s.replace(/\r\n/g, '\n');

  for (let i = 0; i < 100; i++) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const normalized = norm(buffer);
    const parts = normalized.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const seg of parts) {
      const event = seg.match(/event:\s*(\S+)/)?.[1] ?? '?';
      gotEvent = true;
      console.log('SSE event:', event);
      if (event === 'connected' || event === 'done' || event === 'error') {
        console.log('Connectivity check passed');
        process.exit(0);
      }
    }
  }

  if (buffer.trim()) {
    const event = buffer.match(/event:\s*(\S+)/)?.[1];
    if (event) {
      gotEvent = true;
      console.log('SSE event:', event);
    }
  }

  console.log(gotEvent ? 'Connectivity check passed' : 'No complete SSE frame received');
  process.exit(gotEvent ? 0 : 1);
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});
