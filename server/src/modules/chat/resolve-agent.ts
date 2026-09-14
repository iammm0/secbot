const AGENT_ALIASES: Record<string, string> = {
  hackbot: 'hackbot',
  'secbot-cli': 'hackbot',
  secbot: 'hackbot',
  super: 'superhackbot',
  superhackbot: 'superhackbot',
};

export function resolveAgentType(raw?: string | null): string {
  const key = (raw ?? '').trim().toLowerCase();
  return AGENT_ALIASES[key] || 'hackbot';
}
