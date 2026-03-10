# 项目经历 1

**项目名称：** Secbot-安全测试机器人  
**项目时间：** 2025.12-2026.03

---

## 技术选型

Python、LangChain、LangGraph、SQLite、SQLite-Vec、Playwright、FastAPI、TypeScript、React（Ink 终端 UI）、React Native、SSE、Docker

---

## 项目描述

面向授权渗透测试的 AI 驱动安全测试平台。采用多智能体架构，基于 LangChain/LangGraph 实现 PlannerAgent 规划、CoordinatorAgent 协调与专职子智能体（网络侦察、Web 渗透、OSINT、终端运维、防御监控），支持完整攻击链编排与 Payload 生成；集成侦察、漏洞扫描与利用、主动防御、Web 研究（智能搜索、网页提取、深度爬取、API 客户端）等模块。提供 CLI 交互、TypeScript 终端 TUI、移动端（React Native）与远程控制，使用 SQLite 持久化对话、配置与向量检索（SQLite-Vec）。

---

## 责任描述

1. 基于 LangChain/LangGraph 实现多智能体框架，设计 ReAct、Plan-Execute、工具调用与记忆增强等模式；实现 PlannerAgent 结构化规划（Todo 依赖、资源与风险感知）与 TaskExecutor 分层并发执行，CoordinatorAgent 按 agent_hint 委派专职子智能体并聚合结果，SummaryAgent 生成多智能体汇总报告。
2. 实现渗透测试工具链：信息收集、端口与漏洞扫描，支持攻击链编排与 Payload 生成；集成网络、Web、OSINT、终端、防御等专职子智能体及对应工具集。
3. 开发漏洞利用与后渗透模块，支持 SQL 注入、XSS、命令注入、文件上传、路径遍历、SSRF 等自动化利用，以及后渗透利用（权限提升、持久化、横向移动等）。
4. 实现主动防御：网络发现、入侵检测、授权管理与安全报告生成；提供远程控制与文件传输（授权主机）。
5. 提供 CLI 交互，集成语音、爬虫与系统控制；基于 FastAPI + SSE 提供 API，供终端 TUI（TypeScript/Ink）与 React Native 移动端消费；使用 SQLite 持久化对话与配置，可选 SQLite-Vec 向量检索。
6. 编写项目与部署文档、安全说明，配置 Docker 部署与单文件发布版（跨平台可执行程序），保障多环境可维护。
