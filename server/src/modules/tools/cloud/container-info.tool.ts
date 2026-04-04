import { constants as fsConstants, promises as fs } from 'node:fs';
import * as os from 'node:os';
import { BaseTool, ToolResult } from '../core/base-tool';

export class ContainerInfoTool extends BaseTool {
  constructor() {
    super(
      'container_info',
      'Detect Docker/Kubernetes runtime context and container security signals.',
    );
  }

  async run(): Promise<ToolResult> {
    const result: Record<string, unknown> = {
      system: os.platform(),
      hostname: os.hostname(),
      in_container: false,
      container_type: null,
      details: {},
      security_findings: [],
    };

    const docker = await this.detectDocker();
    if (Object.keys(docker).length > 0) {
      result.in_container = true;
      result.container_type = 'docker';
      result.details = { ...(result.details as Record<string, unknown>), ...docker };
    }

    const k8s = await this.detectKubernetes();
    if (Object.keys(k8s).length > 0) {
      result.in_container = true;
      result.container_type = 'kubernetes';
      result.details = { ...(result.details as Record<string, unknown>), ...k8s };
    }

    const details = result.details as Record<string, unknown>;
    details.environment_variables = this.getSensitiveEnvVars();
    details.mounts = await this.getMounts();
    details.capabilities = await this.getCapabilities();

    result.security_findings = this.analyzeSecurity(result);

    return { success: true, result };
  }

  private async detectDocker(): Promise<Record<string, unknown>> {
    const info: Record<string, unknown> = {};

    if (await this.fileExists('/.dockerenv')) {
      info.dockerenv = true;
    }

    const cgroup = await this.readText('/proc/1/cgroup');
    if (cgroup && /(docker|containerd)/i.test(cgroup)) {
      info.cgroup_docker = true;
      for (const line of cgroup.split('\n')) {
        if (!/(docker|containerd)/i.test(line)) continue;
        const parts = line.split('/');
        const id = (parts[parts.length - 1] ?? '').trim();
        if (id.length >= 12) {
          info.container_id = id.slice(0, 12);
        }
        break;
      }
    }

    const procEnviron = await this.readText('/proc/1/environ');
    if (procEnviron && procEnviron.includes('container=docker')) {
      info.proc_environ_docker = true;
    }

    return info;
  }

  private async detectKubernetes(): Promise<Record<string, unknown>> {
    const info: Record<string, unknown> = {};

    if (process.env.KUBERNETES_SERVICE_HOST) {
      info.k8s_service_host = process.env.KUBERNETES_SERVICE_HOST;
      info.k8s_service_port = process.env.KUBERNETES_SERVICE_PORT ?? '';
    }

    if (await this.fileExists('/var/run/secrets/kubernetes.io/serviceaccount/token')) {
      info.service_account_token = true;
      const namespace = await this.readText(
        '/var/run/secrets/kubernetes.io/serviceaccount/namespace',
      );
      if (namespace) {
        info.namespace = namespace.trim();
      }
    }

    const k8sVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if ((key.startsWith('KUBERNETES_') || key.endsWith('_SERVICE_HOST')) && value) {
        k8sVars[key] = value;
      }
    }
    if (Object.keys(k8sVars).length > 0) {
      info.k8s_env_vars = k8sVars;
    }

    return info;
  }

  private getSensitiveEnvVars(): Record<string, string> {
    const sensitiveKeys = [
      'AWS_ACCESS_KEY',
      'AWS_SECRET',
      'API_KEY',
      'TOKEN',
      'PASSWORD',
      'SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'MONGO',
      'MYSQL',
      'POSTGRES',
    ];

    const found: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!value) continue;
      if (!sensitiveKeys.some((needle) => key.toLowerCase().includes(needle.toLowerCase()))) {
        continue;
      }
      found[key] = value.length > 6 ? `${value.slice(0, 3)}***${value.slice(-3)}` : '***';
    }
    return found;
  }

  private async getMounts(): Promise<Array<Record<string, string>>> {
    const mounts: Array<Record<string, string>> = [];
    const content = await this.readText('/proc/mounts');
    if (!content) return mounts;

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      const [device, mountPoint, fsType] = parts;
      if (!mountPoint.startsWith('/')) continue;
      if (['proc', 'sysfs', 'tmpfs', 'devpts', 'mqueue'].includes(fsType)) continue;
      mounts.push({ device, mount_point: mountPoint, fs_type: fsType });
      if (mounts.length >= 20) break;
    }
    return mounts;
  }

  private async getCapabilities(): Promise<Record<string, string>> {
    const caps: Record<string, string> = {};
    const status = await this.readText('/proc/1/status');
    if (!status) return caps;

    for (const line of status.split('\n')) {
      if (!line.startsWith('Cap')) continue;
      const [key, value] = line.split(':', 2);
      if (!key || value === undefined) continue;
      caps[key.trim()] = value.trim();
    }
    return caps;
  }

  private analyzeSecurity(result: Record<string, unknown>): Array<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    const details = (result.details as Record<string, unknown>) ?? {};

    if (!result.in_container) {
      findings.push({ level: 'info', message: 'No container runtime indicators detected.' });
      return findings;
    }

    if (details.service_account_token) {
      findings.push({
        level: 'high',
        message: 'Kubernetes service account token is accessible from this runtime.',
      });
    }

    const caps = (details.capabilities as Record<string, string> | undefined) ?? {};
    if ((caps.CapEff ?? '').trim() === '0000003fffffffff') {
      findings.push({
        level: 'critical',
        message: 'Container appears to run with all effective Linux capabilities.',
      });
    }

    const envVars = (details.environment_variables as Record<string, string> | undefined) ?? {};
    if (Object.keys(envVars).length > 0) {
      findings.push({
        level: 'medium',
        message: `Detected ${Object.keys(envVars).length} potentially sensitive environment variables.`,
      });
    }

    const mounts = (details.mounts as Array<Record<string, string>> | undefined) ?? [];
    for (const mount of mounts) {
      if (['/', '/host', '/hostfs'].includes(mount.mount_point ?? '')) {
        findings.push({
          level: 'high',
          message: `Host-like filesystem mount detected: ${mount.mount_point}`,
        });
      }
    }

    if (findings.length === 0) {
      findings.push({
        level: 'info',
        message: 'No obvious container security misconfiguration detected.',
      });
    }
    return findings;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async readText(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf8');
    } catch {
      return '';
    }
  }
}
