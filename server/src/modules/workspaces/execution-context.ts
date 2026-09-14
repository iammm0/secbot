import { AsyncLocalStorage } from 'node:async_hooks';

export type ExecutionTarget =
  | { kind: 'local'; nodeId: string }
  | { kind: 'secbot'; nodeId: string; origin: string }
  | { kind: 'ssh'; nodeId: string; host: string; port: number };

export const executionContext = new AsyncLocalStorage<ExecutionTarget>();

export function getExecutionTarget(): ExecutionTarget | undefined {
  return executionContext.getStore();
}

type SshCommandResult = {
  success: boolean;
  output: string;
  error: string;
  exitCode?: number;
};

type SshCommandRunner = (
  host: string,
  command: string,
  timeoutSec: number,
) => Promise<SshCommandResult>;

let sshRunner: SshCommandRunner | null = null;

export function setSshCommandRunner(runner: SshCommandRunner | null): void {
  sshRunner = runner;
}

export function getSshCommandRunner(): SshCommandRunner | null {
  return sshRunner;
}
