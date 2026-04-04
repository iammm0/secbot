# 报告工具 (reporting)

## 模块概述

提供安全报告生成与导出能力，将扫描结果、检测发现和交互摘要整合为结构化报告。适用于渗透测试报告、合规审计报告和巡检总结。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| ReportGeneratorTool | report_generator | 安全报告生成与导出 | format, content |

## 依赖关系

- 继承 `BaseTool`（`server/src/modules/tools/core/base-tool.ts`）
- 通过 `server/src/modules/tools/reporting/index.ts` 导出，由 `ToolsService` 自动发现与注册

## 使用示例

```typescript
// Agent 调用示例
const result = await reportGeneratorTool.execute({ format: 'markdown', content: scanResults });
```

```
用户: 生成本次扫描的 Markdown 报告
Agent: 调用 report_generator(format="markdown", content=...)
```

## 安全与权限

- sensitivity=low
- 报告内容来自已有扫描结果，不涉及敏感操作
