import { HttpException, HttpStatus } from '@nestjs/common';

/** 与前端/集成方约定的错误码，便于统计与定制提示 */
export type ClientErrorCode =
  | 'HTTP_EXCEPTION'
  | 'VALIDATION_ERROR'
  | 'LLM_AUTH_FAILED'
  | 'LLM_FORBIDDEN'
  | 'LLM_RATE_LIMIT'
  | 'LLM_BAD_REQUEST'
  | 'LLM_UPSTREAM_REJECTED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_NETWORK'
  | 'INTERNAL_ERROR';

export interface ClientErrorBody {
  statusCode: number;
  code: ClientErrorCode;
  /** 可安全展示给终端用户；不含密钥片段与上游原始 JSON */
  message: string;
}

/**
 * 脱敏：避免把 API Key、Bearer 等写入响应体或 SSE。
 */
export function redactSensitiveText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/\bsk-[a-zA-Z0-9]{10,}\b/gi, 'sk-[REDACTED]')
    .replace(/Bearer\s+[\w.+/=-]{10,}/gi, 'Bearer [REDACTED]')
    .replace(/Your api key\s*:\s*[^\s."]+/gi, 'Your api key: [REDACTED]')
    .replace(/["']?api[_-]?key["']?\s*[:=]\s*["']?[^\s"',}]+/gi, 'api_key=[REDACTED]')
    .slice(0, 2000);
}

function classifyUpstreamLlmError(raw: string): ClientErrorBody | null {
  const lower = raw.toLowerCase();

  if (/\bhttp\s*401\b/.test(raw) || /\b401\b.*unauth/i.test(raw) || lower.includes('authentication fails')) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_AUTH_FAILED',
      message:
        '模型服务认证失败。请在「模型配置」中检查 API Key 是否与当前厂商及 API 地址一致，或确认密钥未过期。',
    };
  }
  if (/\bhttp\s*403\b/.test(raw) || lower.includes('permission denied') || lower.includes('forbidden')) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_FORBIDDEN',
      message: '模型服务拒绝访问。请确认账号权限或所请求的资源是否可用。',
    };
  }
  if (/\bhttp\s*429\b/.test(raw) || lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_RATE_LIMIT',
      message: '模型服务请求过于频繁，请稍后再试。',
    };
  }
  if (
    /\bhttp\s*402\b/.test(raw) ||
    (lower.includes('insufficient') && lower.includes('quota')) ||
    lower.includes('payment required')
  ) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_UPSTREAM_REJECTED',
      message: '模型服务因额度或计费原因暂时无法使用，请检查账户配额。',
    };
  }
  if (
    /\bhttp\s*404\b/.test(raw) &&
    (lower.includes('openai-compat') || lower.includes('chat/completions') || lower.includes('/v1/'))
  ) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_BAD_REQUEST',
      message: '模型接口地址或路径可能不正确，请检查 Base URL 是否指向兼容 OpenAI 的服务。',
    };
  }
  if (/\bhttp\s*5\d{2}\b/.test(raw)) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_UNAVAILABLE',
      message: '模型服务暂时不可用，请稍后重试。',
    };
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    (lower.includes('network') && lower.includes('error'))
  ) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_NETWORK',
      message: '无法连接到模型服务，请检查网络或 Base URL 是否可达。',
    };
  }
  if (lower.includes('openai-compat chat failed')) {
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'LLM_UPSTREAM_REJECTED',
      message: '模型请求未成功。请稍后重试，或在「模型配置」中核对 API。',
    };
  }
  return null;
}

/**
 * 将任意异常转为统一、可暴露给产品端的结构；未知错误不泄露实现细节。
 */
export function mapExceptionToClientBody(exception: unknown): ClientErrorBody {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    let message: string;
    if (typeof res === 'string') {
      message = redactSensitiveText(res);
    } else if (res && typeof res === 'object') {
      const o = res as Record<string, unknown>;
      const m = o['message'];
      if (Array.isArray(m)) {
        message = m
          .map((x) => (typeof x === 'string' ? redactSensitiveText(x) : redactSensitiveText(String(x))))
          .join('; ');
      } else if (typeof m === 'string') {
        message = redactSensitiveText(m);
      } else {
        message = redactSensitiveText(exception.message);
      }
    } else {
      message = redactSensitiveText(exception.message);
    }
    const code: ClientErrorCode =
      status === HttpStatus.BAD_REQUEST ? 'VALIDATION_ERROR' : 'HTTP_EXCEPTION';
    return { statusCode: status, code, message: message || '请求无法完成' };
  }

  const raw = exception instanceof Error ? exception.message : String(exception);
  const classified = classifyUpstreamLlmError(raw);
  if (classified) return classified;

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用，请稍后重试。',
  };
}
