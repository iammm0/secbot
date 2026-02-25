# Payload 工具 (offense/payload)

## 模块概述

提供 Payload 生成与编码能力，供漏洞利用、模糊测试和攻击测试使用。与 `tools.utility.payload_generator_tool.PayloadGeneratorTool` 配合使用。

## 工具列表

当前模块主要为占位结构，具体 Payload 逻辑分布在 `tools.utility.PayloadGeneratorTool` 及 exploit 相关模块中。

## 依赖关系

- 被 exploit、fuzzer 等模块引用
- 与 `tools.utility.payload_generator_tool` 协同

## 安全与权限

- 生成的 Payload 仅用于授权测试
- 使用前需确认目标授权范围
