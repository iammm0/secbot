# Web 安全工具 (web)

## 模块概述

提供 Web 应用安全检测能力，包括目录枚举、WAF 检测、技术栈识别、安全头分析、CORS 检查、JWT 分析、参数模糊测试和 SSRF 检测。适用于 Web 应用渗透测试与安全评估。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| DirBruteforceTool | dir_bruteforce | 目录与文件枚举 | url, wordlist |
| WafDetectTool | waf_detect | WAF 检测与识别 | url |
| TechDetectTool | tech_detect | 技术栈识别 | url |
| HeaderAnalyzeTool | header_analyze | HTTP 安全头分析 | url |
| CorsCheckTool | cors_check | CORS 配置检查 | url |
| JwtAnalyzeTool | jwt_analyze | JWT 令牌分析与漏洞检测 | token |
| ParamFuzzerTool | param_fuzzer | 参数模糊测试 | url, params |
| SsrfDetectTool | ssrf_detect | SSRF 漏洞检测 | url |

## 依赖关系

- 继承 `tools.base.BaseTool`
- 被 `tools.pentest.security` 引入为 `WEB_TOOLS`

## 使用示例

```
用户: 检测 https://example.com 的 WAF
Agent: 调用 waf_detect(url="https://example.com")
```

## 安全与权限

- 均为 sensitivity=low
- 建议仅在授权范围内对目标进行测试
