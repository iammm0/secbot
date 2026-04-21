# Secbot 工具扩展机制

安全工具位于 `server/src/modules/tools/`。当前 `ToolsService` 不是运行时目录扫描，而是从各分类 `index.ts` 导入静态工具数组，再合并成工具注册表。

## 1. 当前分类

| 分类 ID | 路径 | 说明 |
|---------|------|------|
| `security` | `server/src/modules/tools/security/` | 核心安全扫描与攻击测试工具 |
| `defense` | `server/src/modules/tools/defense/` | 防御扫描与系统检查 |
| `utility` | `server/src/modules/tools/utility/` | 编码、哈希、日志、依赖、安全辅助工具 |
| `protocol` | `server/src/modules/tools/protocol/` | MySQL、Redis、SMB、SNMP 等协议探测 |
| `osint` | `server/src/modules/tools/osint/` | OSINT 查询 |
| `cloud` | `server/src/modules/tools/cloud/` | 云与运行时环境检查 |
| `reporting` | `server/src/modules/tools/reporting/` | 报告生成 |
| `control` | `server/src/modules/tools/control/` | 命令执行与终端会话 |
| `crawler` | `server/src/modules/tools/crawler/` | 爬虫工具 |
| `web_research` | `server/src/modules/tools/web-research/` | 搜索、页面提取、深度爬取、API 客户端 |

## 2. BaseTool 接口

`BaseTool` 定义在：

```text
server/src/modules/tools/core/base-tool.ts
```

当前接口：

```typescript
export interface ToolResult {
  success: boolean;
  result: unknown;
  error?: string;
}

export abstract class BaseTool {
  readonly name: string;
  readonly description: string;
  readonly sensitive: boolean;

  constructor(name: string, description: string, sensitive = false) {
    this.name = name;
    this.description = description;
    this.sensitive = sensitive;
  }

  abstract run(params: Record<string, unknown>): Promise<ToolResult>;
}
```

注意当前没有 `getSchema()`、`execute()` 或 `sensitivity` 字段；请使用 `run()` 和 `sensitive`。

## 3. 新增工具流程

以新增 utility 工具为例。

### 3.1 创建工具文件

```typescript
import { BaseTool, ToolResult } from '../core/base-tool';

export class MyCustomTool extends BaseTool {
  constructor() {
    super('my_custom_tool', '自定义工具描述，供 LLM 和工具列表理解。');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params['target'] ?? '').trim();
    if (!target) {
      return {
        success: false,
        result: null,
        error: 'target is required',
      };
    }

    return {
      success: true,
      result: {
        target,
        message: `processed ${target}`,
      },
    };
  }
}
```

建议路径：

```text
server/src/modules/tools/utility/my-custom.tool.ts
```

### 3.2 注册到分类 `index.ts`

在对应分类的 `index.ts` 中导出并加入数组。例如：

```typescript
export { MyCustomTool } from './my-custom.tool';

import { MyCustomTool } from './my-custom.tool';

export const UTILITY_TOOLS = [
  // existing tools...
  new MyCustomTool(),
];
```

具体写法请以该分类当前 `index.ts` 的结构为准，避免重复导入或覆盖已有工具。

### 3.3 验证工具列表

```bash
npm run build
npm run dev
curl http://127.0.0.1:8000/api/tools
```

确认 `total`、对应分类 `count` 和工具名都正确。

### 3.4 直接执行工具

```bash
curl -X POST http://127.0.0.1:8000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"my_custom_tool","params":{"target":"127.0.0.1"}}'
```

## 4. 敏感工具

`BaseTool` 构造函数第三个参数是 `sensitive`：

```typescript
super('dangerous_tool', '可能执行敏感操作的工具', true);
```

敏感行为还应在工具自身或调用链中做二次校验。不要只依赖 LLM 提示词约束。

## 5. 当前不支持的旧机制

以下旧文档中提到的机制当前代码没有实现：

- `SECBOT_TOOL_DIRS`
- `SECBOT_TOOL_DIRS_ADVANCED`
- 运行时扫描外部工具目录
- `getSchema()` 自动暴露工具 schema
- `execute(params)` 作为工具入口
- `advanced_count` 中的独立高级工具池

`GET /api/tools` 目前仍返回 `basic_count` 和 `advanced_count` 字段，但 `advanced_count` 为 `0`，所有注册工具都在统一工具池中。

## 6. 维护建议

- 工具名保持稳定，TUI、Agent 和文档可能引用它。
- `run()` 返回结构尽量可 JSON 序列化。
- 外部命令调用要处理超时、错误码和缺失依赖。
- 高风险工具必须限制输入范围，并在执行结果中给出清晰错误。
- 新增工具后同步更新 [TS_MIGRATION_STATUS.md](TS_MIGRATION_STATUS.md) 中的工具总数和分类统计。
