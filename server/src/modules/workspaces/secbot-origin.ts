export class InvalidNodeAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNodeAddressError';
  }
}

/** Normalize a Secbot API origin. Only http(s), no userinfo, host required. */
export function parseSecbotOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new InvalidNodeAddressError('地址不能为空');
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new InvalidNodeAddressError('不是合法的主机地址');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidNodeAddressError('只支持 http 或 https');
  }
  if (url.username || url.password) {
    throw new InvalidNodeAddressError('地址里不能带账号密码');
  }
  if (!url.hostname) {
    throw new InvalidNodeAddressError('缺少主机名');
  }
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${url.hostname}${port}`;
}

export function parseSshHost(raw: string): { host: string; port: number } {
  let value = raw.trim();
  if (!value) throw new InvalidNodeAddressError('主机地址不能为空');
  value = value.replace(/^ssh:\/\//i, '');
  const at = value.lastIndexOf('@');
  if (at >= 0) value = value.slice(at + 1);
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    const host = value.slice(1, end);
    const rest = value.slice(end + 1);
    const port = rest.startsWith(':') ? Number(rest.slice(1)) : 22;
    if (!host || !Number.isFinite(port)) throw new InvalidNodeAddressError('SSH 地址无效');
    return { host, port };
  }
  const colon = value.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(value.slice(colon + 1))) {
    return { host: value.slice(0, colon), port: Number(value.slice(colon + 1)) };
  }
  return { host: value, port: 22 };
}
