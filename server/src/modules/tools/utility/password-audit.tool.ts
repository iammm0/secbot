import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BaseTool, ToolResult } from '../core/base-tool';

const execFileAsync = promisify(execFile);

const COMMON_WEAK_PASSWORDS = new Set([
  '123456',
  'password',
  '12345678',
  'qwerty',
  '123456789',
  '12345',
  '1234',
  '111111',
  '1234567',
  'dragon',
  '123123',
  'abc123',
  'letmein',
  'shadow',
  'master',
  'qwertyuiop',
  '1234567890',
  'zxcvbnm',
  'iloveyou',
  'admin',
]);

export class PasswordAuditTool extends BaseTool {
  constructor() {
    super(
      'password_audit',
      'Evaluate password strength and optional local password policy checks.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const password = (params.password as string | undefined) ?? '';
    const policyCheck = Boolean(params.policy_check);

    if (!password && !policyCheck) {
      return {
        success: false,
        result: null,
        error: 'Provide password or set policy_check=true',
      };
    }

    const result: Record<string, unknown> = {};
    if (password) result.password_analysis = this.analyzePassword(password);
    if (policyCheck) result.policy_analysis = await this.checkSystemPolicy();
    return { success: true, result };
  }

  private analyzePassword(password: string): Record<string, unknown> {
    const length = password.length;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const charset =
      (hasLower ? 26 : 0) + (hasUpper ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSpecial ? 32 : 0);
    const entropy = charset > 0 ? length * Math.log2(charset) : 0;

    let score = 0;
    score += Math.min(length * 4, 40);
    score += hasLower ? 10 : 0;
    score += hasUpper ? 10 : 0;
    score += hasDigit ? 10 : 0;
    score += hasSpecial ? 15 : 0;
    score += Math.min(entropy / 2, 15);

    const weaknesses: string[] = [];
    if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
      score = Math.max(score - 50, 0);
      weaknesses.push('Matches common weak password list');
    }
    if (/^(.)\1+$/.test(password)) {
      score = Math.max(score - 30, 0);
      weaknesses.push('Repeated same character');
    }
    if (length < 8) weaknesses.push('Too short (<8)');
    if (!hasUpper) weaknesses.push('Missing uppercase character');
    if (!hasLower) weaknesses.push('Missing lowercase character');
    if (!hasDigit) weaknesses.push('Missing digit');
    if (!hasSpecial) weaknesses.push('Missing special character');

    const finalScore = Math.min(Math.round(score), 100);
    const strength =
      finalScore >= 80
        ? 'strong'
        : finalScore >= 60
          ? 'medium'
          : finalScore >= 40
            ? 'weak'
            : 'very_weak';

    const combinations = charset > 0 ? Math.pow(charset, length) : 0;
    const crackSeconds = combinations / 1_000_000_000;
    const estimatedCrackTime =
      crackSeconds < 1
        ? '<1 second'
        : crackSeconds < 60
          ? `${Math.round(crackSeconds)} seconds`
          : crackSeconds < 3600
            ? `${Math.round(crackSeconds / 60)} minutes`
            : crackSeconds < 86400
              ? `${Math.round(crackSeconds / 3600)} hours`
              : crackSeconds < 86400 * 365
                ? `${Math.round(crackSeconds / 86400)} days`
                : `${(crackSeconds / (86400 * 365)).toExponential(1)} years`;

    return {
      length,
      charset: {
        has_lowercase: hasLower,
        has_uppercase: hasUpper,
        has_digits: hasDigit,
        has_special: hasSpecial,
        charset_size: charset,
      },
      entropy_bits: Number(entropy.toFixed(2)),
      score: finalScore,
      strength,
      weaknesses,
      estimated_crack_time: estimatedCrackTime,
      is_common_password: COMMON_WEAK_PASSWORDS.has(password.toLowerCase()),
    };
  }

  private async checkSystemPolicy(): Promise<Record<string, unknown>> {
    const platform = process.platform;
    const checks: string[] = [];
    const output: Record<string, unknown> = { platform, checks };
    try {
      if (platform === 'win32') {
        const { stdout } = await execFileAsync('net', ['accounts'], { timeout: 5000 });
        output.net_accounts = stdout.slice(0, 1500);
        checks.push('Collected Windows account policy');
      } else if (platform === 'darwin') {
        const { stdout } = await execFileAsync('pwpolicy', ['getaccountpolicies'], {
          timeout: 5000,
        });
        output.pwpolicy = stdout.slice(0, 1500);
        checks.push('Collected macOS password policy');
      } else {
        try {
          const { stdout } = await execFileAsync('cat', ['/etc/login.defs'], { timeout: 5000 });
          output.login_defs = stdout.slice(0, 1500);
          checks.push('Collected /etc/login.defs');
        } catch {
          checks.push('Could not read /etc/login.defs');
        }
      }
    } catch (error) {
      output.error = (error as Error).message;
    }
    return output;
  }
}
