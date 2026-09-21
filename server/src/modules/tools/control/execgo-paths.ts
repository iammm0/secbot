import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Resolve execgocli / execgo from env, PATH name, or sibling ../execgo checkout.
 */
export function resolveExecGoCliPath(explicit?: string): string {
  const fromEnv = (explicit || process.env.EXECGO_EXECGOCLI || '').trim();
  if (fromEnv && (fromEnv.includes('/') || fromEnv.includes('\\'))) {
    if (existsSync(fromEnv)) return fromEnv;
  }
  if (fromEnv && !fromEnv.includes('/') && !fromEnv.includes('\\')) {
    return fromEnv;
  }

  for (const candidate of siblingExecGoCandidates('execgocli')) {
    if (existsSync(candidate)) return candidate;
  }
  return 'execgocli';
}

export function resolveExecGoServerPath(): string | null {
  for (const candidate of siblingExecGoCandidates('execgo')) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveSiblingExecGoRoot(): string | null {
  for (const root of siblingExecGoRoots()) {
    if (existsSync(join(root, 'go.mod')) || existsSync(join(root, 'execgocli'))) {
      return root;
    }
  }
  return null;
}

export function resolveExecGoRuntimePath(): string | null {
  for (const candidate of siblingExecGoRuntimeCandidates('execgo-runtime')) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveSiblingExecGoRuntimeRoot(): string | null {
  for (const root of siblingExecGoRuntimeRoots()) {
    if (existsSync(join(root, 'Cargo.toml'))) {
      return root;
    }
  }
  return null;
}

function siblingExecGoCandidates(binary: string): string[] {
  return siblingExecGoRoots().flatMap((root) => [
    join(root, binary),
    join(root, 'bin', binary),
    join(root, 'dist', binary),
  ]);
}

function siblingExecGoRuntimeCandidates(binary: string): string[] {
  return siblingExecGoRuntimeRoots().flatMap((root) => [
    join(root, 'target', 'release', binary),
    join(root, 'target', 'debug', binary),
    join(root, binary),
    join(root, 'bin', binary),
  ]);
}

function siblingExecGoRoots(): string[] {
  const cwd = process.cwd();
  return [
    resolve(cwd, '..', 'execgo'),
    resolve(cwd, 'execgo'),
    resolve(cwd, '..', '..', 'execgo'),
  ];
}

function siblingExecGoRuntimeRoots(): string[] {
  const cwd = process.cwd();
  return [
    resolve(cwd, '..', 'execgo-runtime'),
    resolve(cwd, 'execgo-runtime'),
    resolve(cwd, '..', '..', 'execgo-runtime'),
  ];
}
