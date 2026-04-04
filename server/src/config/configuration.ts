export interface AppConfig {
  port: number;
  env: string;
  llmProvider: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekBaseUrl: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  databasePath: string;
  logLevel: string;
}

export default (): { app: AppConfig } => {
  const p = (key: string, def: string) => (process.env[key] ?? '').trim() || def;
  const n = (key: string, def: number) => {
    const v = process.env[key];
    return v && !Number.isNaN(Number(v)) ? Number(v) : def;
  };

  return {
    app: {
      port: n('PORT', 8000),
      env: p('NODE_ENV', 'development'),
      llmProvider: p('LLM_PROVIDER', 'ollama'),
      ollamaModel: p('OLLAMA_MODEL', 'llama3.2'),
      ollamaBaseUrl: p('OLLAMA_BASE_URL', 'http://localhost:11434'),
      deepseekApiKey: p('DEEPSEEK_API_KEY', ''),
      deepseekModel: p('DEEPSEEK_MODEL', 'deepseek-chat'),
      deepseekBaseUrl: p('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
      openaiApiKey: p('OPENAI_API_KEY', ''),
      openaiBaseUrl: p('OPENAI_BASE_URL', 'https://api.openai.com'),
      databasePath: p('DATABASE_PATH', 'data/opencomsagent.db'),
      logLevel: p('LOG_LEVEL', 'debug'),
    },
  };
};
