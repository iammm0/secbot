import { BaseTool, ToolResult } from '../core/base-tool';

type HibpBreach = {
  Name?: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  PwnCount?: number;
  DataClasses?: string[];
  Description?: string;
};

export class CredentialLeakCheckTool extends BaseTool {
  constructor() {
    super(
      'credential_leak_check',
      'Check whether an email or domain appears in known breach datasets (HIBP).',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const email = String(params.email ?? '').trim();
    const domain = String(params.domain ?? '')
      .trim()
      .toLowerCase();

    if (!email && !domain) {
      return { success: false, result: null, error: 'Provide email or domain' };
    }

    const apiKey = (process.env.HIBP_API_KEY ?? '').trim();
    if (!apiKey) {
      return {
        success: false,
        result: null,
        error: 'Missing HIBP_API_KEY environment variable',
      };
    }

    try {
      if (email) {
        return await this.checkEmail(apiKey, email);
      }
      return await this.checkDomain(apiKey, domain);
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Credential leak check failed: ${(error as Error).message}`,
      };
    }
  }

  private async checkEmail(apiKey: string, email: string): Promise<ToolResult> {
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          'hibp-api-key': apiKey,
          'User-Agent': 'secbot-ts/2.0.0',
          Accept: 'application/json',
        },
      },
    );

    if (response.status === 404) {
      return {
        success: true,
        result: {
          email,
          breached: false,
          breaches_count: 0,
          message: 'No known breaches found for this email.',
        },
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        result: null,
        error: 'HIBP authentication failed. Check HIBP_API_KEY.',
      };
    }
    if (response.status === 429) {
      return { success: false, result: null, error: 'HIBP rate limit exceeded. Retry later.' };
    }
    if (!response.ok) {
      return {
        success: false,
        result: null,
        error: `HIBP request failed: HTTP ${response.status}`,
      };
    }

    const breaches = (await response.json()) as HibpBreach[];
    const normalized = breaches.map((item) => ({
      name: item.Name,
      title: item.Title,
      domain: item.Domain,
      breach_date: item.BreachDate,
      added_date: item.AddedDate,
      pwn_count: item.PwnCount ?? 0,
      data_classes: item.DataClasses ?? [],
      description: String(item.Description ?? '').slice(0, 200),
    }));

    return {
      success: true,
      result: {
        email,
        breached: normalized.length > 0,
        breaches_count: normalized.length,
        breaches: normalized,
        risk_level: normalized.length > 3 ? 'high' : normalized.length > 0 ? 'medium' : 'low',
        recommendation:
          normalized.length > 0
            ? 'Reset affected credentials immediately and enable MFA.'
            : 'No immediate credential leak indicators.',
      },
    };
  }

  private async checkDomain(apiKey: string, domain: string): Promise<ToolResult> {
    const response = await fetch(
      `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`,
      {
        headers: {
          'hibp-api-key': apiKey,
          'User-Agent': 'secbot-ts/2.0.0',
          Accept: 'application/json',
        },
      },
    );

    if (response.status === 404) {
      return {
        success: true,
        result: {
          domain,
          breached: false,
          message: 'No known breach records for this domain.',
        },
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        result: null,
        error: 'HIBP authentication failed. Check HIBP_API_KEY.',
      };
    }
    if (!response.ok) {
      return {
        success: false,
        result: null,
        error: `HIBP domain request failed: HTTP ${response.status}`,
      };
    }

    const breaches = (await response.json()) as HibpBreach[];
    const normalized = breaches.map((item) => ({
      name: item.Name,
      breach_date: item.BreachDate,
      pwn_count: item.PwnCount ?? 0,
      data_classes: item.DataClasses ?? [],
    }));
    const totalPwned = normalized.reduce((sum, item) => sum + Number(item.pwn_count ?? 0), 0);

    return {
      success: true,
      result: {
        domain,
        breached: normalized.length > 0,
        breaches_count: normalized.length,
        total_accounts_pwned: totalPwned,
        breaches: normalized.slice(0, 20),
        risk_level: totalPwned > 10_000 ? 'high' : normalized.length > 0 ? 'medium' : 'low',
      },
    };
  }
}
