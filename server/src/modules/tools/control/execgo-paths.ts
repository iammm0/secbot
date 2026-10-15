import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Resolve execgocli / execgo / execgo-runtime from:
 *   1. Environment variable overrides (EXECGO_EXECGOCLI, EXECGO_SERVER_BIN, EXECGO_RUNTIME_BIN, EXECGO_BIN_DIR)
 *   2. Secbot internal runtime (runtime/bin, runtime/execgo, runtime/execgo-runtime)
 *   3. Sibling ../execgo and ../execgo-runtime repositories (multi-repo dev fallback)
 *   4. System PATH fallback
 */

const isWin = process.platform === 'win32';

function withExeCandidates(pathWithoutExt: string): string[] {
  if (isWin && !pathWithoutExt.toLowerCase().endsWith('.exe')) {
    return [`${pathWithoutExt}.exe`, pathWithoutExt];
  }
  return [pathWithoutExt];
}

export function resolveExecGoCliPath(explicit?: string): string {
  const fromEnv = (explicit || process.env.EXECGO_EXECGOCLI || '').trim();
  if (fromEnv && (fromEnv.includes('/') || fromEnv.includes('\\'))) {
    if (existsSync(fromEnv)) return fromEnv;
  }

  for (const candidate of execGoCandidates('execgocli')) {
    if (existsSync(candidate)) return candidate;
  }

  if (fromEnv) {
    return fromEnv;
  }
  return 'execgocli';
}

export function resolveExecGoServerPath(): string | null {
  const explicit = (process.env.EXECGO_SERVER_BIN || '').trim();
  if (explicit && existsSync(explicit)) return explicit;

  for (const candidate of execGoCandidates('execgo')) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveSiblingExecGoRoot(): string | null {
  for (const root of execGoRoots()) {
    if (existsSync(join(root, 'go.mod')) || existsSync(join(root, 'execgocli')) || existsSync(join(root, 'execgocli.exe'))) {
      return root;
    }
  }
  return null;
}

export function resolveExecGoRuntimePath(): string | null {
  const explicit = (process.env.EXECGO_RUNTIME_BIN || '').trim();
  if (explicit && existsSync(explicit)) return explicit;

  for (const candidate of execGoRuntimeCandidates('execgo-runtime')) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveSiblingExecGoRuntimeRoot(): string | null {
  for (const root of execGoRuntimeRoots()) {
    if (existsSync(join(root, 'Cargo.toml'))) {
      return root;
    }
  }
  return null;
}

/**
 * Returns candidate root folders of the Secbot repository or packaged artifact.
 */
function secbotPackageRoots(): string[] {
  const candidates: string[] = [];
  if (process.env.SECBOT_PACKAGE_ROOT?.trim()) {
    candidates.push(resolve(process.env.SECBOT_PACKAGE_ROOT.trim()));
  }
  if (process.env.SECBOT_WORKSPACE_ROOT?.trim()) {
    candidates.push(resolve(process.env.SECBOT_WORKSPACE_ROOT.trim()));
  }

  // From server/src/modules/tools/control or server/dist/modules/tools/control:
  // 5 levels up reaches repo root or packaged backend root.
  candidates.push(resolve(__dirname, '..', '..', '..', '..', '..'));
  candidates.push(resolve(__dirname, '..', '..', '..', '..'));

  const cwd = process.cwd();
  candidates.push(cwd);
  candidates.push(resolve(cwd, '..'));

  return Array.from(new Set(candidates));
}

function execGoCandidates(binary: string): string[] {
  const candidates: string[] = [];

  // 1. Explicit bin dir
  const binDir = process.env.EXECGO_BIN_DIR?.trim();
  if (binDir) {
    candidates.push(...withExeCandidates(join(binDir, binary)));
  }

  // 2. Secbot internal runtime/bin
  for (const pkgRoot of secbotPackageRoots()) {
    candidates.push(...withExeCandidates(join(pkgRoot, 'runtime', 'bin', binary)));
  }

  // 3. ExecGo roots (internal runtime/execgo, sibling checkouts)
  for (const root of execGoRoots()) {
    candidates.push(...withExeCandidates(join(root, binary)));
    candidates.push(...withExeCandidates(join(root, 'bin', binary)));
    candidates.push(...withExeCandidates(join(root, 'dist', binary)));
  }

  return candidates;
}

function execGoRuntimeCandidates(binary: string): string[] {
  const candidates: string[] = [];

  // 1. Explicit bin dir
  const binDir = process.env.EXECGO_BIN_DIR?.trim();
  if (binDir) {
    candidates.push(...withExeCandidates(join(binDir, binary)));
  }

  // 2. Secbot internal runtime/bin
  for (const pkgRoot of secbotPackageRoots()) {
    candidates.push(...withExeCandidates(join(pkgRoot, 'runtime', 'bin', binary)));
  }

  // 3. ExecGo runtime roots (internal runtime/execgo-runtime, sibling checkouts)
  for (const root of execGoRuntimeRoots()) {
    candidates.push(...withExeCandidates(join(root, 'target', 'release', binary)));
    candidates.push(...withExeCandidates(join(root, 'target', 'debug', binary)));
    candidates.push(...withExeCandidates(join(root, binary)));
    candidates.push(...withExeCandidates(join(root, 'bin', binary)));
  }

  return candidates;
}

function execGoRoots(): string[] {
  const roots: string[] = [];

  // Internal runtime/execgo
  for (const pkgRoot of secbotPackageRoots()) {
    roots.push(join(pkgRoot, 'runtime', 'execgo'));
  }

  // Sibling checkouts (fallback)
  const cwd = process.cwd();
  roots.push(resolve(cwd, '..', 'execgo'));
  roots.push(resolve(cwd, 'execgo'));
  roots.push(resolve(cwd, '..', '..', 'execgo'));

  return Array.from(new Set(roots));
}

function execGoRuntimeRoots(): string[] {
  const roots: string[] = [];

  // Internal runtime/execgo-runtime
  for (const pkgRoot of secbotPackageRoots()) {
    roots.push(join(pkgRoot, 'runtime', 'execgo-runtime'));
  }

  // Sibling checkouts (fallback)
  const cwd = process.cwd();
  roots.push(resolve(cwd, '..', 'execgo-runtime'));
  roots.push(resolve(cwd, 'execgo-runtime'));
  roots.push(resolve(cwd, '..', '..', 'execgo-runtime'));

  return Array.from(new Set(roots));
}
