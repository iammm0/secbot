import { promises as fs } from 'node:fs';
import { BaseTool, ToolResult } from '../core/base-tool';

export class ContainerEscapeCheckTool extends BaseTool {
  constructor() {
    super('container_escape_check', '容器逃逸检测 — 检查 Docker/K8s 容器中的逃逸向量');
  }

  async run(_params: Record<string, unknown>): Promise<ToolResult> {
    const findings: Array<{ vector: string; severity: string; detail: string }> = [];

    // Check if we're in a container
    const inContainer = await this.isInContainer();
    if (!inContainer) {
      return { success: true, result: { in_container: false, note: '当前环境不在容器内' } };
    }

    // Check privileged mode
    const privileged = await this.checkPrivileged();
    if (privileged) {
      findings.push({
        vector: 'privileged_mode',
        severity: 'critical',
        detail: '容器以 --privileged 运行，可直接挂载宿主机文件系统逃逸',
      });
    }

    // Check Docker socket mount
    const dockerSock = await this.fileExists('/var/run/docker.sock');
    if (dockerSock) {
      findings.push({
        vector: 'docker_socket',
        severity: 'critical',
        detail: 'Docker socket 已挂载，可通过 API 创建特权容器逃逸',
      });
    }

    // Check dangerous capabilities
    const caps = await this.getCapabilities();
    const dangerousCaps = ['cap_sys_admin', 'cap_sys_ptrace', 'cap_net_admin', 'cap_dac_override'];
    const foundCaps = caps.filter((c) => dangerousCaps.includes(c.toLowerCase()));
    if (foundCaps.length) {
      findings.push({
        vector: 'dangerous_capabilities',
        severity: 'high',
        detail: `危险 capabilities: ${foundCaps.join(', ')}`,
      });
    }

    // Check sensitive mounts
    const sensitivePaths = ['/proc/sysrq-trigger', '/proc/kcore', '/sys/kernel', '/dev/mem'];
    for (const p of sensitivePaths) {
      if (await this.fileExists(p)) {
        findings.push({
          vector: 'sensitive_mount',
          severity: 'high',
          detail: `敏感路径可访问: ${p}`,
        });
        break;
      }
    }

    // Check writable cgroup
    const cgroupWritable = await this.checkCgroupWritable();
    if (cgroupWritable) {
      findings.push({
        vector: 'writable_cgroup',
        severity: 'high',
        detail: 'cgroup 可写，可能通过 release_agent 逃逸',
      });
    }

    // Check service account token (K8s)
    const saToken = await this.fileExists('/var/run/secrets/kubernetes.io/serviceaccount/token');
    if (saToken) {
      findings.push({
        vector: 'k8s_service_account',
        severity: 'medium',
        detail: 'K8s ServiceAccount token 存在，检查 RBAC 权限',
      });
    }

    // Check host PID/network namespace
    const hostPid = await this.checkHostPidNs();
    if (hostPid) {
      findings.push({
        vector: 'host_pid_namespace',
        severity: 'high',
        detail: '共享宿主机 PID namespace，可访问宿主机进程',
      });
    }

    return {
      success: true,
      result: {
        in_container: true,
        findings_count: findings.length,
        risk_level: findings.some((f) => f.severity === 'critical')
          ? 'critical'
          : findings.some((f) => f.severity === 'high')
            ? 'high'
            : findings.length
              ? 'medium'
              : 'low',
        findings,
      },
    };
  }

  private async isInContainer(): Promise<boolean> {
    return (
      (await this.fileExists('/.dockerenv')) ||
      (await this.fileContains('/proc/1/cgroup', 'docker|kubepods|containerd'))
    );
  }

  private async checkPrivileged(): Promise<boolean> {
    try {
      const data = await fs.readFile('/proc/self/status', 'utf8');
      const capEff = data.match(/CapEff:\s*([0-9a-f]+)/i);
      if (capEff) return capEff[1] === '0000003fffffffff' || capEff[1] === '000001ffffffffff';
    } catch {
      /* not available */
    }
    return false;
  }

  private async getCapabilities(): Promise<string[]> {
    try {
      const data = await fs.readFile('/proc/self/status', 'utf8');
      const capEff = data.match(/CapEff:\s*([0-9a-f]+)/i);
      if (!capEff) return [];
      const val = BigInt('0x' + capEff[1]);
      const CAP_NAMES = [
        'cap_chown',
        'cap_dac_override',
        'cap_dac_read_search',
        'cap_fowner',
        'cap_fsetid',
        'cap_kill',
        'cap_setgid',
        'cap_setuid',
        'cap_setpcap',
        'cap_linux_immutable',
        'cap_net_bind_service',
        'cap_net_broadcast',
        'cap_net_admin',
        'cap_net_raw',
        'cap_ipc_lock',
        'cap_ipc_owner',
        'cap_sys_module',
        'cap_sys_rawio',
        'cap_sys_chroot',
        'cap_sys_ptrace',
        'cap_sys_pacct',
        'cap_sys_admin',
      ];
      return CAP_NAMES.filter((_, i) => (val >> BigInt(i)) & 1n);
    } catch {
      return [];
    }
  }

  private async checkCgroupWritable(): Promise<boolean> {
    try {
      await fs.access('/sys/fs/cgroup', 0o2); // W_OK
      return true;
    } catch {
      return false;
    }
  }

  private async checkHostPidNs(): Promise<boolean> {
    try {
      const entries = await fs.readdir('/proc');
      // If we can see many PIDs (>100), likely host PID ns
      const pids = entries.filter((e) => /^\d+$/.test(e));
      return pids.length > 100;
    } catch {
      return false;
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async fileContains(path: string, pattern: string): Promise<boolean> {
    try {
      const data = await fs.readFile(path, 'utf8');
      return new RegExp(pattern, 'i').test(data);
    } catch {
      return false;
    }
  }
}
