# 云安全工具 (cloud)

## 模块概述

提供云环境安全检测能力，包括云元数据探测、S3 存储桶枚举和容器环境检测。适用于云资产发现、配置审计和容器安全评估。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| CloudMetadataTool | cloud_metadata | 云实例元数据探测 | - |
| S3BucketEnumTool | s3_bucket_enum | S3 存储桶枚举与权限检测 | bucket, region |
| ContainerInfoTool | container_info | 容器环境信息检测 | - |

## 依赖关系

- 继承 `BaseTool`（`server/src/modules/tools/core/base-tool.ts`）
- 通过 `server/src/modules/tools/cloud/index.ts` 导出，由 `ToolsService` 自动发现与注册
- 云元数据探测依赖运行在云实例内

## 使用示例

```typescript
// Agent 调用示例
const result = await containerInfoTool.execute({});
```

```
用户: 检测当前是否在容器中运行
Agent: 调用 container_info()
```

## 安全与权限

- 均为 sensitivity=low
- S3 枚举需 AWS 凭证或匿名访问权限
