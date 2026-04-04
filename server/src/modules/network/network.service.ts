import { Injectable } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  AuthorizeRequestDto,
  AuthorizeResponseDto,
  AuthorizationInfoDto,
  AuthorizationListResponseDto,
  ConnectTargetRequestDto,
  DiscoverRequestDto,
  DiscoverResponseDto,
  DisconnectTargetRequestDto,
  DownloadFileRequestDto,
  ExecuteTargetRequestDto,
  HostInfoDto,
  RevokeResponseDto,
  TargetListResponseDto,
  UploadFileRequestDto,
} from './dto/network.dto';
import { SessionsService } from '../sessions/sessions.service';
import { RemoteControlService } from './remote-control.service';

type AuthorizationRecord = {
  target_ip: string;
  auth_type: string;
  credentials: Record<string, unknown>;
  created_at: string;
  expires_at: string | null;
  description: string | null;
  status: 'active' | 'revoked' | 'expired';
  revoked_at?: string;
  updated_at?: string;
};

const execFileAsync = promisify(execFile);

@Injectable()
export class NetworkService {
  private readonly authFilePath: string;
  private readonly authorizations = new Map<string, AuthorizationRecord>();
  private discoveredHosts: HostInfoDto[] = [];
  private readonly scanHistory: Array<{ network: string; timestamp: string; hosts_found: number }> =
    [];

  private readonly commonPorts = [22, 23, 80, 135, 139, 443, 445, 3389, 5985, 5986];
  private readonly serviceByPort: Record<number, string> = {
    22: 'SSH',
    23: 'Telnet',
    80: 'HTTP',
    135: 'MSRPC',
    139: 'NetBIOS',
    443: 'HTTPS',
    445: 'SMB',
    3389: 'RDP',
    5985: 'WinRM',
    5986: 'WinRM-SSL',
  };

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly remoteControl: RemoteControlService,
  ) {
    this.authFilePath = path.resolve(process.cwd(), 'data', 'authorizations.json');
    this.loadAuthorizations();
  }

  async discover(body: DiscoverRequestDto): Promise<DiscoverResponseDto> {
    const network = (body.network || '').trim() || this.getLocalNetwork();
    if (!network) {
      return { success: false, hosts: [] };
    }

    try {
      const ips = this.expandNetworkHosts(network, 1024);
      const scanned = await this.runWithConcurrency(
        ips,
        80,
        async (ip) => await this.discoverHost(ip),
      );
      const discovered = scanned.filter((host): host is HostInfoDto => Boolean(host));

      this.discoveredHosts = discovered.map((host) => ({
        ...host,
        authorized: this.isAuthorized(host.ip),
      }));

      this.scanHistory.push({
        network,
        timestamp: new Date().toISOString(),
        hosts_found: this.discoveredHosts.length,
      });

      return { success: true, hosts: this.discoveredHosts };
    } catch {
      return { success: false, hosts: [] };
    }
  }

  async listTargets(authorizedOnly: boolean): Promise<TargetListResponseDto> {
    const byIp = new Map<string, HostInfoDto>();

    for (const host of this.discoveredHosts) {
      byIp.set(host.ip, {
        ...host,
        authorized: this.isAuthorized(host.ip),
      });
    }

    for (const auth of this.authorizations.values()) {
      if (!this.isAuthorized(auth.target_ip)) continue;
      if (!byIp.has(auth.target_ip)) {
        byIp.set(auth.target_ip, {
          ip: auth.target_ip,
          hostname: 'Unknown',
          macAddress: 'Unknown',
          openPorts: [],
          services: {},
          authorized: true,
          status: 'unknown',
          discoveredAt: new Date().toISOString(),
        });
      }
    }

    let targets = [...byIp.values()];
    if (authorizedOnly) {
      targets = targets.filter((target) => target.authorized);
    }
    return { targets };
  }

  async authorize(body: AuthorizeRequestDto): Promise<AuthorizeResponseDto> {
    const now = new Date().toISOString();
    const expiresAt = this.parseExpiresAt(body.expiresAt);

    const record: AuthorizationRecord = {
      target_ip: body.targetIp,
      auth_type: body.authType || 'full',
      credentials: {
        username: body.username,
        ...(body.password ? { password: body.password } : {}),
        ...(body.keyFile ? { key_file: body.keyFile } : {}),
      },
      created_at: now,
      expires_at: expiresAt,
      description: body.description ?? null,
      status: 'active',
    };

    this.authorizations.set(body.targetIp, record);
    this.saveAuthorizations();

    return {
      success: true,
      message: `Authorization granted for ${body.targetIp}`,
    };
  }

  async listAuthorizations(): Promise<AuthorizationListResponseDto> {
    const authorizations: AuthorizationInfoDto[] = [...this.authorizations.values()].map(
      (record) => ({
        targetIp: record.target_ip,
        authType: record.auth_type,
        username: String(record.credentials.username ?? 'N/A'),
        createdAt: record.created_at,
        description: record.description ?? 'N/A',
        status: record.status,
        expiresAt: record.expires_at ?? '',
      }),
    );
    return { authorizations };
  }

  async revokeAuthorization(targetIp: string): Promise<RevokeResponseDto> {
    const record = this.authorizations.get(targetIp);
    if (!record) {
      return {
        success: false,
        message: `Authorization not found: ${targetIp}`,
      };
    }

    record.status = 'revoked';
    record.revoked_at = new Date().toISOString();
    record.updated_at = record.revoked_at;
    this.saveAuthorizations();

    return {
      success: true,
      message: `Authorization revoked: ${targetIp}`,
    };
  }

  async connectTarget(body: ConnectTargetRequestDto): Promise<Record<string, unknown>> {
    const targetIp = body.targetIp;
    const auth = this.getAuthorization(targetIp);
    if (!auth) {
      return { success: false, error: 'Target is not authorized' };
    }

    const connectionType = this.determineConnectionType(targetIp, body.connectionType);
    const creds = auth.credentials;

    if (connectionType === 'ssh') {
      const username = String(creds.username ?? '');
      const password = String(creds.password ?? '') || undefined;
      const keyFile = String(creds.key_file ?? creds.keyFile ?? '') || undefined;
      const port = this.resolvePort(targetIp, connectionType, creds);

      if (!username) {
        return { success: false, error: 'Missing SSH username in credentials' };
      }

      const connected = await this.remoteControl.connectSsh(
        targetIp,
        port,
        username,
        password,
        keyFile,
      );
      if (!connected) {
        return { success: false, error: 'SSH connection failed' };
      }

      const sessionId = this.sessionsService.createSession(
        targetIp,
        connectionType,
        this.toAuthInfo(auth),
      );
      return { success: true, session_id: sessionId, connection_type: connectionType };
    }

    if (connectionType === 'winrm') {
      const username = String(creds.username ?? '');
      const password = String(creds.password ?? '');
      if (!username || !password) {
        return { success: false, error: 'Missing WinRM username/password in credentials' };
      }

      const connected = this.remoteControl.connectWinrm(targetIp, username, password);
      if (!connected) {
        return { success: false, error: 'WinRM connection failed' };
      }

      const sessionId = this.sessionsService.createSession(
        targetIp,
        connectionType,
        this.toAuthInfo(auth),
      );
      return { success: true, session_id: sessionId, connection_type: connectionType };
    }

    return { success: false, error: `Unsupported connection type: ${connectionType}` };
  }

  async executeOnTarget(body: ExecuteTargetRequestDto): Promise<Record<string, unknown>> {
    const targetIp = body.targetIp;
    const auth = this.getAuthorization(targetIp);
    if (!auth) {
      return { success: false, error: 'Target is not authorized' };
    }

    const connectionType = this.determineConnectionType(targetIp, body.connectionType);
    const creds = auth.credentials;

    const result = await this.remoteControl.executeCommand(targetIp, body.command, connectionType, {
      port: this.resolvePort(targetIp, connectionType, creds),
      username: String(creds.username ?? ''),
      password: String(creds.password ?? '') || undefined,
      keyFile: String(creds.key_file ?? creds.keyFile ?? '') || undefined,
    });

    const sessions = this.sessionsService.getSessionsByTarget(targetIp);
    if (sessions.length > 0) {
      this.sessionsService.addCommand(sessions[0].session_id, body.command, result);
    }

    return result;
  }

  async uploadToTarget(body: UploadFileRequestDto): Promise<Record<string, unknown>> {
    const targetIp = body.targetIp;
    const auth = this.getAuthorization(targetIp);
    if (!auth) {
      return { success: false, error: 'Target is not authorized' };
    }

    const connectionType = body.connectionType || 'ssh';
    const creds = auth.credentials;
    const result = await this.remoteControl.uploadFile(
      targetIp,
      body.localPath,
      body.remotePath,
      connectionType,
      {
        port: this.resolvePort(targetIp, connectionType, creds),
        username: String(creds.username ?? ''),
        password: String(creds.password ?? '') || undefined,
        keyFile: String(creds.key_file ?? creds.keyFile ?? '') || undefined,
      },
    );

    const sessions = this.sessionsService.getSessionsByTarget(targetIp);
    if (sessions.length > 0) {
      this.sessionsService.addFileTransfer(
        sessions[0].session_id,
        'upload',
        body.localPath,
        body.remotePath,
        result,
      );
    }

    return result;
  }

  async downloadFromTarget(body: DownloadFileRequestDto): Promise<Record<string, unknown>> {
    const targetIp = body.targetIp;
    const auth = this.getAuthorization(targetIp);
    if (!auth) {
      return { success: false, error: 'Target is not authorized' };
    }

    const connectionType = body.connectionType || 'ssh';
    const creds = auth.credentials;
    const result = await this.remoteControl.downloadFile(
      targetIp,
      body.remotePath,
      body.localPath,
      connectionType,
      {
        port: this.resolvePort(targetIp, connectionType, creds),
        username: String(creds.username ?? ''),
        password: String(creds.password ?? '') || undefined,
        keyFile: String(creds.key_file ?? creds.keyFile ?? '') || undefined,
      },
    );

    const sessions = this.sessionsService.getSessionsByTarget(targetIp);
    if (sessions.length > 0) {
      this.sessionsService.addFileTransfer(
        sessions[0].session_id,
        'download',
        body.localPath,
        body.remotePath,
        result,
      );
    }

    return result;
  }

  async disconnectTarget(body: DisconnectTargetRequestDto): Promise<Record<string, unknown>> {
    const connectionType = body.connectionType || 'ssh';
    this.remoteControl.disconnect(body.targetIp, connectionType);

    const sessions = this.sessionsService.getSessionsByTarget(body.targetIp);
    for (const session of sessions) {
      this.sessionsService.closeSession(session.session_id);
    }

    return { success: true, message: `Disconnected ${body.targetIp} (${connectionType})` };
  }

  async listActiveControlSessions(): Promise<Record<string, unknown>> {
    return {
      active_sessions: this.remoteControl.getActiveSessions(),
    };
  }

  async getAuthorizedTargets(): Promise<Record<string, unknown>> {
    const targets: Array<Record<string, unknown>> = [];
    for (const auth of this.authorizations.values()) {
      if (!this.isAuthorized(auth.target_ip)) continue;
      const host = this.getHostByIp(auth.target_ip);
      if (host) {
        targets.push({
          ...host,
          authorization: this.toAuthInfo(auth),
        });
      } else {
        targets.push({
          ip: auth.target_ip,
          authorized: true,
          authorization: this.toAuthInfo(auth),
          status: 'unknown',
        });
      }
    }
    return { targets };
  }

  private async discoverHost(ip: string): Promise<HostInfoDto | null> {
    const openPorts = await this.scanCommonPorts(ip);
    if (openPorts.length === 0) {
      return null;
    }

    const [hostname, macAddress, osType] = await Promise.all([
      this.resolveHostname(ip),
      this.getMacAddress(ip),
      this.detectOsType(ip, openPorts),
    ]);

    const services: Record<number, string> = {};
    for (const port of openPorts) {
      services[port] = this.serviceByPort[port] ?? 'Unknown';
    }

    return {
      ip,
      hostname,
      macAddress: macAddress ?? 'Unknown',
      openPorts,
      services,
      authorized: this.isAuthorized(ip),
      osType,
      status: 'online',
      discoveredAt: new Date().toISOString(),
    };
  }

  private async scanCommonPorts(ip: string): Promise<number[]> {
    const checks = await Promise.all(
      this.commonPorts.map(async (port) => ({
        port,
        open: await this.checkPort(ip, port, 400),
      })),
    );
    return checks.filter((item) => item.open).map((item) => item.port);
  }

  private checkPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (open: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(open);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.connect(port, host);
    });
  }

  private async resolveHostname(ip: string): Promise<string> {
    try {
      const resolved = await dns.reverse(ip);
      if (resolved.length > 0) return resolved[0];
    } catch {
      // ignore reverse DNS failures
    }
    return 'Unknown';
  }

  private async getMacAddress(ip: string): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('arp', ['-a', ip], {
          timeout: 5000,
          windowsHide: true,
        });
        return this.extractMacAddress(stdout);
      }

      const { stdout } = await execFileAsync('arp', ['-n', ip], {
        timeout: 5000,
      });
      return this.extractMacAddress(stdout);
    } catch {
      return null;
    }
  }

  private extractMacAddress(raw: string): string | null {
    const matched = raw.match(/\b([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\b/i);
    if (!matched) return null;
    return matched[1].replace(/-/g, ':').toLowerCase();
  }

  private async detectOsType(ip: string, openPorts: number[]): Promise<string | undefined> {
    const windowsHint =
      openPorts.includes(3389) ||
      openPorts.includes(5985) ||
      openPorts.includes(5986) ||
      openPorts.includes(135) ||
      openPorts.includes(445);
    const linuxHint = openPorts.includes(22) && !windowsHint;
    const telnetHint = openPorts.includes(23) && !openPorts.includes(22);

    const ttl = await this.getPingTtl(ip);
    if (ttl !== null) {
      if (ttl <= 64) return linuxHint ? 'Linux/Unix' : 'Linux/Unix (heuristic)';
      if (ttl <= 128) return windowsHint ? 'Windows' : 'Windows (heuristic)';
      return 'Network Device (heuristic)';
    }

    if (windowsHint) return 'Windows (port heuristic)';
    if (linuxHint) return 'Linux/Unix (port heuristic)';
    if (telnetHint) return 'Network Device (port heuristic)';
    return undefined;
  }

  private async getPingTtl(ip: string): Promise<number | null> {
    try {
      const args =
        process.platform === 'win32' ? ['-n', '1', '-w', '1000', ip] : ['-c', '1', '-W', '1', ip];
      const options =
        process.platform === 'win32'
          ? { timeout: 3000, windowsHide: true as const }
          : { timeout: 3000 };

      const { stdout } = await execFileAsync('ping', args, options);
      const matched = stdout.match(/ttl[=\s:](\d+)/i);
      if (!matched) return null;
      const ttl = Number(matched[1]);
      if (!Number.isFinite(ttl)) return null;
      return ttl;
    } catch {
      return null;
    }
  }

  private getLocalNetwork(): string | null {
    const interfaces = os.networkInterfaces();
    for (const addrs of Object.values(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family !== 'IPv4') continue;
        if (addr.internal) continue;
        const parts = addr.address.split('.');
        if (parts.length !== 4) continue;
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      }
    }
    return null;
  }

  private expandNetworkHosts(cidr: string, maxHosts: number): string[] {
    const normalized = cidr.includes('/') ? cidr : `${cidr}/24`;
    const [ipPart, prefixPart] = normalized.split('/');
    const prefix = Number(prefixPart);
    if (!Number.isFinite(prefix) || prefix < 8 || prefix > 32) {
      throw new Error(`Invalid CIDR prefix: ${cidr}`);
    }

    const ipInt = this.ipv4ToInt(ipPart);
    if (ipInt === null) {
      throw new Error(`Invalid IPv4 address: ${ipPart}`);
    }

    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const networkInt = ipInt & mask;
    const hostCount = 2 ** (32 - prefix);

    const start = prefix >= 31 ? networkInt : networkInt + 1;
    const end = prefix >= 31 ? networkInt + hostCount - 1 : networkInt + hostCount - 2;

    const hosts: string[] = [];
    for (let current = start; current <= end; current += 1) {
      hosts.push(this.intToIpv4(current >>> 0));
      if (hosts.length >= maxHosts) break;
    }

    return hosts;
  }

  private ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.').map((item) => Number(item));
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
      return null;
    }
    return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
  }

  private intToIpv4(value: number): string {
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(
      '.',
    );
  }

  private parseExpiresAt(raw: string | undefined): string | null {
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private isAuthorized(targetIp: string): boolean {
    const record = this.authorizations.get(targetIp);
    if (!record) return false;
    if (record.status !== 'active') return false;

    if (record.expires_at) {
      const expiresAt = new Date(record.expires_at);
      if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
        record.status = 'expired';
        record.updated_at = new Date().toISOString();
        this.saveAuthorizations();
        return false;
      }
    }

    return true;
  }

  private getAuthorization(targetIp: string): AuthorizationRecord | null {
    if (!this.isAuthorized(targetIp)) return null;
    return this.authorizations.get(targetIp) ?? null;
  }

  private determineConnectionType(targetIp: string, preferred?: string): string {
    if (preferred && preferred.trim()) return preferred.trim().toLowerCase();

    const host = this.getHostByIp(targetIp);
    const ports = host?.openPorts ?? [];
    if (ports.includes(22)) return 'ssh';
    if (ports.includes(3389)) return 'rdp';
    if (ports.includes(5985) || ports.includes(5986)) return 'winrm';
    return 'ssh';
  }

  private resolvePort(
    targetIp: string,
    connectionType: string,
    credentials: Record<string, unknown>,
  ): number {
    const explicit = Number(credentials.port);
    if (Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }

    const host = this.getHostByIp(targetIp);
    if (connectionType === 'ssh') {
      if (host?.openPorts.includes(22)) return 22;
      return 22;
    }
    if (connectionType === 'winrm') {
      if (host?.openPorts.includes(5985)) return 5985;
      if (host?.openPorts.includes(5986)) return 5986;
      return 5985;
    }
    return 22;
  }

  private getHostByIp(ip: string): HostInfoDto | undefined {
    return this.discoveredHosts.find((host) => host.ip === ip);
  }

  private toAuthInfo(auth: AuthorizationRecord): Record<string, unknown> {
    return {
      target_ip: auth.target_ip,
      auth_type: auth.auth_type,
      credentials: auth.credentials,
      created_at: auth.created_at,
      expires_at: auth.expires_at,
      description: auth.description,
      status: auth.status,
    };
  }

  private loadAuthorizations(): void {
    try {
      fs.mkdirSync(path.dirname(this.authFilePath), { recursive: true });
      if (!fs.existsSync(this.authFilePath)) {
        return;
      }

      const raw = fs.readFileSync(this.authFilePath, 'utf8');
      if (!raw.trim()) return;

      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return;
      }

      const entries = Object.entries(parsed as Record<string, unknown>);
      for (const [targetIp, value] of entries) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const rec = value as Record<string, unknown>;

        this.authorizations.set(targetIp, {
          target_ip: String(rec.target_ip ?? targetIp),
          auth_type: String(rec.auth_type ?? 'full'),
          credentials:
            rec.credentials &&
            typeof rec.credentials === 'object' &&
            !Array.isArray(rec.credentials)
              ? (rec.credentials as Record<string, unknown>)
              : {},
          created_at: String(rec.created_at ?? new Date().toISOString()),
          expires_at: rec.expires_at ? String(rec.expires_at) : null,
          description: rec.description ? String(rec.description) : null,
          status: this.normalizeStatus(rec.status),
          revoked_at: rec.revoked_at ? String(rec.revoked_at) : undefined,
          updated_at: rec.updated_at ? String(rec.updated_at) : undefined,
        });
      }
    } catch {
      this.authorizations.clear();
    }
  }

  private saveAuthorizations(): void {
    try {
      const obj: Record<string, AuthorizationRecord> = {};
      for (const [ip, record] of this.authorizations.entries()) {
        obj[ip] = record;
      }
      fs.mkdirSync(path.dirname(this.authFilePath), { recursive: true });
      fs.writeFileSync(this.authFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
      // persistence failures are non-fatal for API behavior
    }
  }

  private normalizeStatus(value: unknown): AuthorizationRecord['status'] {
    const status = String(value ?? 'active').toLowerCase();
    if (status === 'revoked' || status === 'expired') return status;
    return 'active';
  }

  private async runWithConcurrency<TInput, TResult>(
    items: TInput[],
    concurrency: number,
    worker: (item: TInput) => Promise<TResult>,
  ): Promise<TResult[]> {
    const outputs: TResult[] = new Array(items.length);
    let index = 0;

    const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) return;
        outputs[current] = await worker(items[current]);
      }
    });

    await Promise.all(runners);
    return outputs;
  }
}
