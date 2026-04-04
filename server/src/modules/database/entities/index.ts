export interface Conversation {
  id?: number;
  agentType: string;
  userMessage: string;
  assistantMessage: string;
  sessionId: string;
  timestamp: string;
  metadata: string;
}

export interface PromptChain {
  id?: number;
  name: string;
  content: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  metadata: string;
}

export interface UserConfig {
  id?: number;
  key: string;
  value: string;
  category: string;
  description: string;
  updatedAt: string;
}

export interface CrawlerTask {
  id?: number;
  url: string;
  taskType: string;
  status: string;
  result: string;
  createdAt: string;
  updatedAt: string;
  metadata: string;
}

export interface AttackTask {
  id?: number;
  taskId: string;
  target: string;
  attackType: string;
  status: string;
  result: string;
  schedule: string;
  createdAt: string;
  lastRun: string;
  runCount: number;
  metadata: string;
}

export interface ScanResult {
  id?: number;
  target: string;
  scanType: string;
  result: string;
  vulnerabilities: string;
  createdAt: string;
  metadata: string;
}

export interface AuditRecord {
  id?: number;
  sessionId: string;
  agent: string;
  stepType: string;
  content: string;
  metadata: string;
  timestamp: string;
}
