import { BaseTool, ToolResult } from '../core/base-tool';

const COMMON_PATHS = [
  '/swagger.json',
  '/swagger/v1/swagger.json',
  '/api-docs',
  '/openapi.json',
  '/openapi.yaml',
  '/v2/api-docs',
  '/v3/api-docs',
  '/docs',
  '/redoc',
  '/swagger-ui.html',
  '/swagger-ui/',
  '/graphql',
  '/graphiql',
  '/altair',
  '/playground',
  '/api/graphql',
  '/.well-known/openapi.json',
  '/api/schema',
  '/api/v1/schema',
  '/api/docs',
];

const GRAPHQL_INTROSPECTION = JSON.stringify({
  query: '{ __schema { types { name } queryType { name } mutationType { name } } }',
});

export class ApiSchemaScanTool extends BaseTool {
  constructor() {
    super('api_schema_scan', 'API Schema 发现 — 探测 OpenAPI/Swagger/GraphQL 端点');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) return { success: false, result: null, error: '缺少必要参数: target (base URL)' };

    const baseUrl = target.replace(/\/+$/, '');
    const timeoutMs = Math.min(Number(params.timeout) || 10, 30) * 1000;
    const extraPaths = Array.isArray(params.paths) ? params.paths.map(String) : [];

    const paths = [...COMMON_PATHS, ...extraPaths];
    const found: Array<Record<string, unknown>> = [];

    const results = await Promise.allSettled(paths.map((p) => this.probe(baseUrl + p, timeoutMs)));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        found.push({ path: paths[i], url: baseUrl + paths[i], ...r.value });
      }
    }

    // Try GraphQL introspection on discovered GraphQL endpoints
    const gqlEndpoints = found.filter((f) => f.type === 'graphql');
    for (const ep of gqlEndpoints) {
      const intro = await this.graphqlIntrospect(ep.url as string, timeoutMs);
      if (intro) ep.introspection = intro;
    }

    return {
      success: true,
      result: {
        target: baseUrl,
        paths_checked: paths.length,
        endpoints_found: found.length,
        endpoints: found,
      },
    };
  }

  private async probe(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'secbot/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });

      if (resp.status >= 400) return null;

      const ct = resp.headers.get('content-type') ?? '';
      const body = await resp.text();
      const snippet = body.slice(0, 500);

      if (ct.includes('json') || body.startsWith('{')) {
        try {
          const json = JSON.parse(body.slice(0, 50000));
          if (json.openapi || json.swagger) {
            return {
              type: 'openapi',
              version: json.openapi ?? json.swagger,
              title: json.info?.title,
              paths_count: json.paths ? Object.keys(json.paths).length : undefined,
            };
          }
          if (json.data?.__schema || json.__schema) {
            return { type: 'graphql', note: 'GraphQL introspection 可用' };
          }
        } catch {
          /* not valid JSON */
        }
      }

      if (/graphql|graphiql|playground/i.test(url) && resp.status === 200) {
        return { type: 'graphql', content_type: ct };
      }

      if (/swagger|redoc|api-docs/i.test(url) && resp.status === 200) {
        return { type: 'swagger_ui', content_type: ct, snippet };
      }

      return null;
    } catch {
      return null;
    }
  }

  private async graphqlIntrospect(
    url: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'secbot/1.0' },
        body: GRAPHQL_INTROSPECTION,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (resp.status !== 200) return null;
      const json = await resp.json();
      const schema = json?.data?.__schema;
      if (!schema) return null;

      return {
        query_type: schema.queryType?.name,
        mutation_type: schema.mutationType?.name,
        types_count: schema.types?.length,
        types: schema.types?.map((t: { name: string }) => t.name).slice(0, 30),
      };
    } catch {
      return null;
    }
  }
}
