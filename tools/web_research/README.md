# Web 研究工具 (web_research)

## 模块概述

提供联网研究与信息提取能力，包括智能搜索、网页提取、深度爬取、API 交互，以及通过 WebResearchTool 桥接 WebResearchAgent 子 Agent 完成复杂研究任务。适用于漏洞研究、技术调研和公开情报收集。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| SmartSearchTool | smart_search | 智能搜索与结果提取 | query |
| PageExtractTool | page_extract | 网页内容提取 | url |
| DeepCrawlTool | deep_crawl | 深度爬取与链接发现 | url, depth |
| ApiClientTool | api_client | API 请求与交互 | url, method |
| WebResearchTool | web_research | 桥接 WebResearchAgent 子 Agent | query |

## 依赖关系

- 继承 `tools.base.BaseTool`
- 被 `tools.pentest.security` 引入为 `WEB_RESEARCH_TOOLS`
- WebResearchTool 委托给 `core.agents.web_research_agent.WebResearchAgent`

## 使用示例

```
用户: 搜索 CVE-2024-1234 的利用方式
Agent: 调用 smart_search(query="CVE-2024-1234 exploit")
```

## 安全与权限

- 均为 sensitivity=low
- 仅访问公开可用的 Web 资源
