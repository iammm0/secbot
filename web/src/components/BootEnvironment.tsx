import { useEffect, useState } from 'react';
import {
  fetchRuntimeEnvironment,
  installRuntimeTool,
  type RuntimeToolStatus,
} from '@/lib/runtimeTools';

const SKIP_KEY = 'secbot-runtime-skip';

type Phase = 'checking' | 'installing' | 'ready' | 'missing' | 'done';

export function BootEnvironment() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [tools, setTools] = useState<RuntimeToolStatus[]>([]);
  const [hint, setHint] = useState('SYSTEM BOOT · ENVIRONMENT CHECK');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SKIP_KEY) === '1') {
      setPhase('done');
      return;
    }
    let cancelled = false;
    const started = Date.now();
    void (async () => {
      try {
        const report = await fetchRuntimeEnvironment();
        const wait = Math.max(0, 1100 - (Date.now() - started));
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (cancelled) return;
        setTools(report.tools);
        if (report.ready) {
          setHint('本机环境已就绪');
          setPhase('ready');
          window.setTimeout(() => {
            if (!cancelled) setPhase('done');
          }, 700);
          return;
        }
        setPhase('installing');
        for (const tool of report.tools.filter(
          (item) => !item.installed && item.kind !== 'optional',
        )) {
          if (cancelled) return;
          setHint(`正在安装 ${tool.id}`);
          setBusy(tool.id);
          const result = await installRuntimeTool(tool.id);
          if (cancelled) return;
          if (!result.success) {
            const hintText =
              (typeof result.result === 'object' && result.result && 'manual_hint' in result.result
                ? String((result.result as { manual_hint?: string }).manual_hint || '')
                : '') || tools.find((item) => item.id === tool.id)?.manual_hint;
            setError([result.error || `安装 ${tool.id} 失败`, hintText].filter(Boolean).join('\n'));
            setHint('安装未完成');
            setBusy(null);
            await refresh().catch(() => undefined);
            setPhase('missing');
            return;
          }
          setTools((current) =>
            current.map((item) => (item.id === tool.id ? { ...item, installed: true } : item)),
          );
        }
        setBusy(null);
        if (!cancelled) await refresh();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '环境检测失败');
        setHint('环境检测未完成');
        setPhase('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    const report = await fetchRuntimeEnvironment();
    setTools(report.tools);
    if (report.ready) {
      setHint('本机环境已就绪');
      setPhase('ready');
      window.setTimeout(() => setPhase('done'), 700);
    }
    return report;
  };

  const install = async (id: string) => {
    setBusy(id);
    setError(null);
    setHint(`正在安装 ${id}`);
    try {
      const result = await installRuntimeTool(id);
      if (!result.success) throw new Error(result.error || `安装 ${id} 失败`);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `安装 ${id} 失败`);
      setHint('安装未完成');
      setPhase('missing');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const installMissing = async () => {
    const missing = tools
      .filter((tool) => !tool.installed && tool.kind !== 'optional')
      .map((tool) => tool.id);
    for (const id of missing) {
      const ok = await install(id);
      if (!ok) return;
    }
  };

  const skip = () => {
    sessionStorage.setItem(SKIP_KEY, '1');
    setPhase('done');
  };

  if (phase === 'done') return null;

  return (
    <div className="boot-overlay fixed inset-0 z-[80] flex items-center justify-center bg-[#050807] text-[#00ff88]">
      <div className="boot-grid pointer-events-none absolute inset-0" />
      <div className="boot-glow pointer-events-none absolute inset-0" />
      <div className="boot-scan pointer-events-none absolute right-[-10%] left-[-10%] h-0.5" />
      <div className="relative flex w-[min(440px,calc(100%-3rem))] flex-col items-center gap-6">
        <div className="boot-title font-mono text-2xl font-bold tracking-[0.22em] md:text-4xl">
          欢迎使用 SECBOT
        </div>
        <div className="font-mono text-[11px] tracking-[0.28em] text-[#00ff88]/55 uppercase">
          {hint}
        </div>
        <ul className="w-full space-y-2 font-mono text-xs">
          {phase === 'checking' || (phase === 'installing' && tools.length === 0) ? (
            <li className="text-center text-[#00ff88]/70">正在检测并安装必备工具</li>
          ) : (
            tools.map((tool) => (
              <li
                key={tool.id}
                className="flex flex-col gap-1 rounded-md border border-[#00ff88]/20 bg-black/30 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="text-sm">{tool.id}</span>
                    <span className="ml-2 text-[#00ff88]/50">{tool.description}</span>
                    {tool.kind === 'optional' ? (
                      <span className="ml-2 text-[#00ff88]/40">可选</span>
                    ) : null}
                    {tool.bundled ? <span className="ml-2 text-[#00ff88]/40">随包</span> : null}
                  </span>
                  {tool.installed ? (
                    <span className="text-[#00ff88]">已安装</span>
                  ) : busy === tool.id || phase === 'installing' ? (
                    <span className="text-[#00ff88]/80">
                      {busy === tool.id ? '安装中' : '等待安装'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="rounded border border-[#00ff88]/40 px-2 py-0.5 text-[#00ff88] hover:bg-[#00ff88]/10 disabled:opacity-40"
                      disabled={busy !== null}
                      onClick={() => void install(tool.id)}
                    >
                      {busy === tool.id ? '安装中' : '重试'}
                    </button>
                  )}
                </div>
                {!tool.installed && tool.manual_hint ? (
                  <p className="break-all font-mono text-[10px] leading-relaxed text-[#00ff88]/45">
                    {tool.manual_hint}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>
        {error ? (
          <p className="whitespace-pre-wrap text-center font-mono text-xs leading-relaxed text-red-400">
            {error}
          </p>
        ) : null}
        {phase === 'missing' ? (
          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              type="button"
              className="rounded-md bg-[#00ff88] px-3 py-1.5 text-[#050807] disabled:opacity-40"
              disabled={busy !== null || tools.every((tool) => tool.installed)}
              onClick={() => void installMissing()}
            >
              {busy ? `正在安装 ${busy}` : '重试安装'}
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-[#00ff88]/70 hover:text-[#00ff88]"
              disabled={busy !== null}
              onClick={skip}
            >
              稍后
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
