# 入口与依赖注入范式

极简入口、NestJS 模块化与依赖注入的通用做法。

## 1. 极简入口

- **单命令入口**：安装后通过 `npm start` 或 `npm run start:stack` 直接进入交互模式，降低心智负担。
- **入口函数**：入口文件 `server/src/main.ts` 只做两件事：创建 NestJS 应用实例，启动 HTTP 监听。不在入口里写业务逻辑。

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();
```

- **全局实例**：轻量对象（如 Logger）可在模块级初始化；重型对象（Agent、记忆管理器）通过 NestJS 的依赖注入容器管理，框架保证单例生命周期。

## 2. NestJS 模块化与依赖注入

- **模式**：每个功能域封装为一个 NestJS `@Module()`，通过 `providers` 注册服务，通过 `imports` 导入依赖模块，通过 `exports` 暴露给其他模块使用。

```typescript
@Module({
  imports: [DatabaseModule, ConfigModule],
  providers: [AgentService, AgentFactory],
  exports: [AgentService],
})
export class AgentModule {}
```

- **好处**：避免进程内重复创建大模型客户端或重型依赖；同一类型 Service 共享状态时也更一致。NestJS 默认以单例方式管理 `providers`。
- **类型校验**：通过 TypeScript 类型系统和 NestJS 装饰器（`@Injectable()`、`@Inject()`）保证依赖类型安全。

## 3. 单例管理（NestJS 默认行为）

- **场景**：NestJS 应用中所有通过 `@Injectable()` 注册的 Service 默认为单例，整个应用生命周期内只创建一次。
- **示例**：`DatabaseService` 首次注入时创建，之后所有模块注入的都是同一实例。Agent 等依赖 audit、db 的，在模块内部按依赖顺序由 NestJS 容器自动初始化。

```typescript
@Injectable()
export class DatabaseService {
  private db: Database;

  constructor(private configService: ConfigService) {
    this.db = new Database(configService.get('DATABASE_PATH') ?? 'data/secbot.db');
  }
}
```

- **会话 ID**：服务端可在请求上下文中生成或接收 `sessionId`，通过请求范围或中间件传递，便于日志与审计关联。

## 4. Controller 与 Service 分层

- **目标**：Controller 层负责 HTTP 路由与请求/响应处理，Service 层负责业务逻辑，两者通过依赖注入连接。
- **做法**：将业务逻辑放在 `@Injectable()` 的 Service 中，Controller 通过构造函数注入 Service 并调用。TUI 与 API 都可以注入同一个 Service，保证行为一致。

```typescript
@Controller('api/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    return this.agentService.process(dto);
  }
}
```

## 5. 可复用要点小结

- 入口：`main.ts` 只做创建应用 + 监听端口，不写业务逻辑。
- 模块化：每个功能域封装为 NestJS Module，通过 `imports` / `exports` 管理依赖关系。
- 依赖注入：`@Injectable()` + 构造函数注入，NestJS 容器自动管理单例生命周期。
- 分层：Controller 负责 HTTP 路由，Service 负责业务逻辑，通过依赖注入连接，TUI 与 API 共用同一套 Service。
