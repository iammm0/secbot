/**
 * 无 TUI 的连通性测试：检查后端 + POST /api/chat 收到首条 SSE。
 * 用法: cd terminal-ui && node --import tsx scripts/check-connection.mts
 */
const BASE = process.env.SECBOT_API_URL ?? process.env.BASE_URL ?? 'http://localhost:8000';

async function check() {
  console.log('检查后端:', BASE);
  const infoRes = await fetch(`${BASE}/api/system/info`).catch((e) => null);
  if (!infoRes?.ok) {
    console.error('后端未就绪，请先运行: python -m router.main');
    process.exit(1);
  }
  console.log('后端 OK');

  console.log('请求 POST /api/chat (message=hi)...');
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hi', mode: 'agent' }),
  });
  if (!res.ok) {
    console.error('POST /api/chat 失败:', res.status, await res.text());
    process.exit(1);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    console.error('无 response.body');
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
      console.log('收到 SSE 事件:', event);
      if (event === 'connected' || event === 'done' || event === 'error') {
        console.log('连通性测试通过');
        process.exit(0);
      }
    }
  }
  if (buffer.trim()) {
    const event = buffer.match(/event:\s*(\S+)/)?.[1];
    if (event) {
      gotEvent = true;
      console.log('收到 SSE 事件:', event);
    }
  }
  console.log(gotEvent ? '连通性测试通过' : '未收到完整 SSE 段落');
  process.exit(gotEvent ? 0 : 1);
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});
