# Secbot 工具扩展机制

Secbot 的安全工具位于 `server/src/modules/tools/` 目录下，当前集成了 54 个工具。新工具通过继承 `BaseTool` 类并注册到工具模块即可被发现和调用。

## 方式一：继承 BaseTool（推荐）

在 `server/src/modules/tools/` 下创建新的工具文件，继承 `BaseTool` 类：

```typescript
import { BaseTool, ToolResult } from '../base-tool';

export class MyCustomTool extends BaseTool {
  name = 'my_custom_tool';
  description = '自定义工具描述（供 LLM 理解）';
  sensitivity = 'low'; // 'low' | 'high'，high 表示敏感操作需用户确认

  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: '目标地址',
          },
        },
        required: ['target'],
      },
    };
  }

  async execute(params: Record<string, any>): Promise<ToolResult> {
    const { target } = params;
    // 工具逻辑
    return {
      success: true,
      output: `扫描 ${target} 完成`,
    };
  }
}
```

然后在对应的工具注册模块中导入并注册。

## 方式二：环境变量（用于临时扩展）

```bash
# 基础工具目录，逗号分隔
export SECBOT_TOOL_DIRS="/path/to/custom-tools"

# 高级工具目录
export SECBOT_TOOL_DIRS_ADVANCED="/path/to/advanced-tools"
```

## 工具分类

- **基础工具（basic）**：hackbot / superhackbot 均可用
- **高级工具（advanced）**：仅 superhackbot 可用，需用户确认

## 工具类要求

继承 `BaseTool`，实现以下成员：

- `name`：工具唯一标识
- `description`：描述（供 LLM 理解）
- `getSchema()`：返回 `{ name, description, parameters }`
- `execute(params)`：异步执行，返回 `ToolResult`

可选：`sensitivity = 'high'` 表示敏感操作，superhackbot 会要求用户确认。

## 目录结构

```
server/src/modules/tools/
├── base-tool.ts          # BaseTool 基类与 ToolResult 类型
├── tools.module.ts       # 工具模块注册
├── tools.service.ts      # 工具发现与管理服务
├── network/              # 网络扫描相关工具
├── security/             # 安全检测工具
├── web/                  # Web 安全工具
├── exploit/              # 漏洞利用工具
├── defense/              # 防御工具
├── osint/                # 开源情报工具
├── reporting/            # 报告生成工具
└── ...                   # 更多分类
```
