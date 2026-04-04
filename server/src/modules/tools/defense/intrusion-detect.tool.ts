import { BaseTool, ToolResult } from '../core/base-tool';

type AttackEvent = {
  timestamp: string;
  source_ip: string;
  attack_types: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  matched_indicators: string[];
};

const ATTACK_EVENTS: AttackEvent[] = [];

const PATTERNS: Array<{
  type: string;
  severity: AttackEvent['severity'];
  regexes: RegExp[];
}> = [
  {
    type: 'port_scan',
    severity: 'medium',
    regexes: [/nmap/i, /masscan/i, /scan(?:ning)?\s+ports?/i, /syn\s+scan/i],
  },
  {
    type: 'brute_force',
    severity: 'high',
    regexes: [/invalid password/i, /authentication failed/i, /login failed/i, /too many attempts/i],
  },
  {
    type: 'sql_injection',
    severity: 'high',
    regexes: [/(union\s+select|or\s+1=1|sleep\(|benchmark\()/i, /sql syntax/i, /sqlstate/i],
  },
  {
    type: 'xss',
    severity: 'medium',
    regexes: [/<script/i, /onerror\s*=/i, /onload\s*=/i, /javascript:/i],
  },
  {
    type: 'dos',
    severity: 'critical',
    regexes: [/flood/i, /denial of service/i, /request rate exceeded/i, /connection reset/i],
  },
  {
    type: 'malware',
    severity: 'critical',
    regexes: [/reverse shell/i, /meterpreter/i, /powershell -enc/i, /cmd\.exe/i],
  },
];

const SEVERITY_ORDER: Record<AttackEvent['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function clampHours(value: unknown, fallback = 24): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), 24 * 30);
}

function calculateSeverity(severities: AttackEvent['severity'][]): AttackEvent['severity'] {
  if (severities.length === 0) return 'low';
  return severities.reduce((best, current) =>
    SEVERITY_ORDER[current] > SEVERITY_ORDER[best] ? current : best,
  );
}

export class IntrusionDetectTool extends BaseTool {
  constructor() {
    super(
      'intrusion_detect',
      'Detect potential intrusions from input telemetry and report recent attack patterns.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const sourceIp = String(params.source_ip ?? '').trim();
    const data = String(params.data ?? '').trim();
    const hours = clampHours(params.hours, 24);

    try {
      const result: Record<string, unknown> = {};

      if (sourceIp && data) {
        result.realtime_detection = this.detectAndStore(sourceIp, data);
      }

      const recentAttacks = this.getRecentAttacks(hours);
      const attackCounts: Record<string, number> = {};
      for (const event of ATTACK_EVENTS) {
        for (const type of event.attack_types) {
          attackCounts[type] = (attackCounts[type] ?? 0) + 1;
        }
      }

      result.recent_attacks = recentAttacks;
      result.recent_attack_count = recentAttacks.length;
      result.statistics = {
        total_detected: ATTACK_EVENTS.length,
        attack_counts: attackCounts,
      };

      return { success: true, result };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private detectAndStore(sourceIp: string, data: string): Record<string, unknown> {
    const matchedTypes: string[] = [];
    const matchedIndicators: string[] = [];
    const matchedSeverities: AttackEvent['severity'][] = [];

    for (const pattern of PATTERNS) {
      let matched = false;
      for (const regex of pattern.regexes) {
        if (regex.test(data)) {
          matched = true;
          matchedIndicators.push(regex.source);
        }
      }
      if (matched) {
        matchedTypes.push(pattern.type);
        matchedSeverities.push(pattern.severity);
      }
    }

    if (matchedTypes.length === 0) {
      return {
        detected: false,
        source_ip: sourceIp,
        confidence: 0,
        matched_indicators: [],
      };
    }

    const severity = calculateSeverity(matchedSeverities);
    const confidence = Math.min(0.95, 0.4 + matchedTypes.length * 0.15);
    const event: AttackEvent = {
      timestamp: new Date().toISOString(),
      source_ip: sourceIp,
      attack_types: [...new Set(matchedTypes)],
      severity,
      confidence,
      matched_indicators: [...new Set(matchedIndicators)],
    };
    ATTACK_EVENTS.push(event);

    if (ATTACK_EVENTS.length > 2000) {
      ATTACK_EVENTS.splice(0, ATTACK_EVENTS.length - 2000);
    }

    return {
      detected: true,
      ...event,
    };
  }

  private getRecentAttacks(hours: number): AttackEvent[] {
    const from = Date.now() - hours * 60 * 60 * 1000;
    return ATTACK_EVENTS.filter((event) => {
      const ts = Date.parse(event.timestamp);
      return Number.isFinite(ts) && ts >= from;
    });
  }
}
