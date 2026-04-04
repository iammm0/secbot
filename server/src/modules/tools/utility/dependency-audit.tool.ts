import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';

type Dependency = {
  name: string;
  version?: string;
  ecosystem: string;
};

const SUPPORTED_DEP_FILES = new Set([
  'requirements.txt',
  'package.json',
  'package-lock.json',
  'pyproject.toml',
]);

export class DependencyAuditTool extends BaseTool {
  constructor() {
    super('dependency_audit', 'Parse dependency files and query known vulnerabilities via OSV.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = (params.path as string | undefined)?.trim();
    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: path' };
    }

    try {
      const deps = await this.parseDependencies(target);
      if (deps.length === 0) {
        return { success: false, result: null, error: 'No supported dependency files found' };
      }

      const vulnerabilityDetails: Array<Record<string, unknown>> = [];
      for (const dep of deps) {
        const vulns = await this.queryOSV(dep);
        if (vulns.length > 0) {
          vulnerabilityDetails.push({
            package: dep.name,
            version: dep.version ?? 'unspecified',
            ecosystem: dep.ecosystem,
            vulnerabilities: vulns,
          });
        }
      }

      const totalVulns = vulnerabilityDetails.reduce(
        (sum, row) => sum + ((row.vulnerabilities as unknown[])?.length ?? 0),
        0,
      );

      return {
        success: true,
        result: {
          path: target,
          packages_scanned: deps.length,
          vulnerable_packages: vulnerabilityDetails.length,
          total_vulnerabilities: totalVulns,
          risk_level: totalVulns > 0 ? 'high' : 'low',
          details: vulnerabilityDetails.slice(0, 50),
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private async parseDependencies(targetPath: string): Promise<Dependency[]> {
    const stat = await fs.stat(targetPath);
    const files = stat.isFile() ? [targetPath] : await this.findDependencyFiles(targetPath, 3);
    const result: Dependency[] = [];
    const dedupe = new Set<string>();

    for (const filePath of files) {
      const filename = path.basename(filePath).toLowerCase();
      const deps = await this.parseByFile(filename, filePath);
      for (const dep of deps) {
        const key = `${dep.ecosystem}:${dep.name}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        result.push(dep);
      }
    }
    return result;
  }

  private async findDependencyFiles(root: string, maxDepth: number): Promise<string[]> {
    const output: string[] = [];
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    const ignored = new Set([
      'node_modules',
      '.git',
      '.venv',
      'venv',
      'dist',
      'build',
      '__pycache__',
    ]);

    while (queue.length > 0) {
      const current = queue.shift() as { dir: string; depth: number };
      if (current.depth > maxDepth) continue;
      const entries = await fs.readdir(current.dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current.dir, entry.name);
        if (entry.isFile() && SUPPORTED_DEP_FILES.has(entry.name.toLowerCase())) {
          output.push(full);
        } else if (entry.isDirectory() && !ignored.has(entry.name)) {
          queue.push({ dir: full, depth: current.depth + 1 });
        }
      }
    }
    return output;
  }

  private async parseByFile(filename: string, filePath: string): Promise<Dependency[]> {
    switch (filename) {
      case 'requirements.txt':
        return await this.parseRequirements(filePath);
      case 'package.json':
        return await this.parsePackageJson(filePath);
      case 'package-lock.json':
        return await this.parsePackageLock(filePath);
      case 'pyproject.toml':
        return await this.parsePyprojectToml(filePath);
      default:
        return [];
    }
  }

  private async parseRequirements(filePath: string): Promise<Dependency[]> {
    const content = await fs.readFile(filePath, 'utf8');
    const deps: Dependency[] = [];
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('-')) continue;
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*([=<>!~]+)\s*([^\s;#,]+)/);
      if (match) {
        deps.push({ name: match[1], version: match[3], ecosystem: 'PyPI' });
      } else {
        const pkg = line.match(/^([A-Za-z0-9_.-]+)/);
        if (pkg) deps.push({ name: pkg[1], ecosystem: 'PyPI' });
      }
    }
    return deps;
  }

  private async parsePackageJson(filePath: string): Promise<Dependency[]> {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content) as Record<string, Record<string, string>>;
    const deps: Dependency[] = [];
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(data[section] ?? {})) {
        deps.push({ name, version: version.replace(/^[~^><=]+/, ''), ecosystem: 'npm' });
      }
    }
    return deps;
  }

  private async parsePackageLock(filePath: string): Promise<Dependency[]> {
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content) as Record<string, unknown>;
    const packages = (data.packages as Record<string, Record<string, unknown>> | undefined) ?? {};
    const deps: Dependency[] = [];
    for (const [key, value] of Object.entries(packages)) {
      if (!key.startsWith('node_modules/')) continue;
      const name = key.slice('node_modules/'.length);
      const version = String(value.version ?? '');
      deps.push({ name, version, ecosystem: 'npm' });
    }
    return deps;
  }

  private async parsePyprojectToml(filePath: string): Promise<Dependency[]> {
    const content = await fs.readFile(filePath, 'utf8');
    const deps: Dependency[] = [];
    const listSection = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (!listSection) return deps;
    const items = listSection[1]
      .split('\n')
      .map((l) => l.trim().replace(/,$/, '').replace(/^"/, '').replace(/"$/, ''))
      .filter(Boolean);
    for (const item of items) {
      const match = item.match(/^([A-Za-z0-9_.-]+)\s*([=<>!~]+)\s*(.+)$/);
      if (match) deps.push({ name: match[1], version: match[3], ecosystem: 'PyPI' });
      else deps.push({ name: item, ecosystem: 'PyPI' });
    }
    return deps;
  }

  private async queryOSV(dep: Dependency): Promise<Array<Record<string, unknown>>> {
    try {
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: { name: dep.name, ecosystem: dep.ecosystem },
          version: dep.version,
        }),
      });
      if (!response.ok) return [];
      const data = (await response.json()) as Record<string, unknown>;
      const vulns = (data.vulns as Array<Record<string, unknown>> | undefined) ?? [];
      return vulns.slice(0, 10).map((v) => ({
        id: v.id,
        summary: v.summary,
        details: String(v.details ?? '').slice(0, 500),
        aliases: v.aliases,
      }));
    } catch {
      return [];
    }
  }
}
