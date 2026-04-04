# 配置与环境变量范式

.env 分层、NestJS ConfigModule 集成与敏感信息处理，与具体业务无关。

## 1. 环境变量分层

- **首选 .env**：使用 NestJS 的 `@nestjs/config` 模块（内置 `dotenv` 支持）在应用启动时加载 `.env`，便于本地与部署用同一套键名，且不把敏感值写进代码。
- **键命名**：按模块或功能前缀，如 `LLM_PROVIDER`、`OLLAMA_BASE_URL`、`DEEPSEEK_API_KEY`、`DATABASE_PATH`、`PORT`、`LOG_LEVEL`，便于搜索与文档化。
- **布尔与数字**：用字符串（如 `true`/`false`、`0.7`），在代码里通过 `ConfigService` 按需转为 boolean/number；或约定 `1`/`0`、`yes`/`no` 并统一解析，避免多处解析逻辑不一致。

## 2. ConfigModule 集成

在 `AppModule` 中全局注册 `ConfigModule`：

```typescript
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // ... 其他模块
  ],
})
export class AppModule {}
```

在 Service 中通过 `ConfigService` 读取配置：

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmService {
  private readonly provider: string;
  private readonly ollamaBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get<string>('LLM_PROVIDER', 'ollama');
    this.ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
  }
}
```

## 3. env.example 约定

- **提供 env.example**：列出所有支持的键及注释说明用途、可选值、示例。不包含真实密钥或敏感信息。
- **说明格式**：注释写清「当 XXX 时使用」「格式：…」「不设置时默认…」，便于新人与部署复制为 `.env` 后修改。
- **可选配置**：未使用的服务可在 env.example 中注释掉，并注明「当前未使用，仅用于 Docker Compose」等，避免误导。

## 4. 敏感信息处理

- **原则**：API Key、密码等不写入 .env 提交到仓库；本地开发可 .env 且 .gitignore，生产建议用系统密钥管理服务（如 Vault、AWS Secrets Manager 等）。
- **环境变量优先**：生产环境通过系统环境变量或容器 secrets 注入；`ConfigService` 会自动读取进程环境变量，优先级高于 `.env` 文件中的同名变量。
- **回退策略**：在 `ConfigService.get()` 中提供默认值作为回退，确保开发环境即使未配置也能启动。

## 5. 配置状态与诊断

- **配置检查接口**：通过 `GET /api/system/status` 返回各 provider 是否已配置（如 `{ "deepseek": true, "ollama": false }`），便于前端或调试页展示「哪些已配置、哪些未配置」，而不暴露具体密钥。
- **日志**：避免在日志中打印完整 API Key；若需标识，仅打印前缀或掩码（如前 8 位 + `***`）。

## 6. 可复用要点小结

- 配置以 `.env` + `@nestjs/config` 的 `ConfigModule` 为主，键名分层、注释完整；提供 `env.example` 且不含敏感信息。
- 全局注册 `ConfigModule.forRoot({ isGlobal: true })`，所有模块通过 `ConfigService` 统一读取。
- 敏感信息：生产环境用系统环境变量或密钥管理服务，开发环境用 `.env`（已 `.gitignore`）。
- 配置状态接口用于前端/调试，不暴露密钥；日志中不输出完整密钥。
