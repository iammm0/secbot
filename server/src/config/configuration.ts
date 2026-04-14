import { loadYamlConfig } from './yaml-config-loader.js';

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
  // 项目根目录（server/ 上一级）
  const rootDir = process.cwd();
  const { envFormat: yamlEnv } = loadYamlConfig(rootDir);

  // 优先级: .env > YAML（YAML 作为默认值兜底）
  const p = (yamlKey: string, envKey: string, def: string) => {
    const yamlVal = (yamlEnv[yamlKey] ?? '').trim();
    const envVal = (process.env[envKey] ?? '').trim();
    return envVal || yamlVal || def;
  };
  const n = (yamlKey: string, envKey: string, def: number) => {
    const yamlVal = yamlEnv[yamlKey];
    const envVal = process.env[envKey];
    const v = envVal || yamlVal;
    return v && !Number.isNaN(Number(v)) ? Number(v) : def;
  };

  return {
    app: {
      port: n('SERVER.PORT', 'PORT', 8000),
      env: p('LOG.ENV', 'NODE_ENV', 'development'),
      llmProvider: p('LLM.PROVIDER', 'LLM_PROVIDER', 'ollama'),
      ollamaModel: p('LLM.OLLAMA.MODEL', 'OLLAMA_MODEL', 'llama3.2'),
      ollamaBaseUrl: p('LLM.OLLAMA.BASE_URL', 'OLLAMA_BASE_URL', 'http://localhost:11434'),
      deepseekApiKey: p('LLM.DEEPSEEK.API_KEY', 'DEEPSEEK_API_KEY', ''),
      deepseekModel: p('LLM.DEEPSEEK.MODEL', 'DEEPSEEK_MODEL', 'deepseek-chat'),
      deepseekBaseUrl: p('LLM.DEEPSEEK.BASE_URL', 'DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
      openaiApiKey: p('LLM.OPENAI.API_KEY', 'OPENAI_API_KEY', ''),
      openaiBaseUrl: p('LLM.OPENAI.BASE_URL', 'OPENAI_BASE_URL', 'https://api.openai.com'),
      databasePath: p('DATABASE.PATH', 'DATABASE_PATH', 'data/opencomsagent.db'),
      logLevel: p('LOG.LEVEL', 'LOG_LEVEL', 'debug'),
    },
  };
};
