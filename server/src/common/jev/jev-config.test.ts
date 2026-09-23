import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearJevEnv,
  defaultJevRuntimeConfig,
  getJevRuntimeConfig,
  isJevStageEnabled,
  setJevRuntimeConfig,
  toPublicJevConfig,
} from './jev-config';

describe('jev-config', () => {
  beforeEach(() => {
    clearJevEnv();
  });

  afterEach(() => {
    clearJevEnv();
  });

  it('defaults all stages off without env', () => {
    const config = defaultJevRuntimeConfig();
    expect(config.enabled).toBe(false);
    expect(config.intent).toBe(false);
    expect(config.apiKey).toBe('');
    expect(isJevStageEnabled('intent', config)).toBe(false);
    expect(toPublicJevConfig(config).hasApiKey).toBe(false);
  });

  it('requires master switch and api key before a stage is live', () => {
    process.env.SECBOT_JEV_ENABLED = '1';
    process.env.SECBOT_JEV_INTENT = 'true';
    process.env.TYPESAFE_API_KEY = 'sk-test';
    const config = defaultJevRuntimeConfig();
    expect(isJevStageEnabled('intent', config)).toBe(true);
    expect(isJevStageEnabled('qaLive', config)).toBe(false);
  });

  it('caches setJevRuntimeConfig and hides the key in public view', () => {
    const saved = setJevRuntimeConfig({
      enabled: true,
      intent: true,
      apiKey: 'secret-key',
      model: 'jev-1.13.0',
    });
    expect(getJevRuntimeConfig().apiKey).toBe('secret-key');
    expect(toPublicJevConfig(saved).hasApiKey).toBe(true);
    expect(toPublicJevConfig(saved)).not.toHaveProperty('apiKey');
    expect(process.env.SECBOT_JEV_ENABLED).toBe('1');
  });
});
