# Secbot 自动化安全基准测试（Benchmark Suite）

本目录包含 Secbot 体系化的自动化渗透测试基准评估框架（Eval Harness），用于对标行业公开标准靶场（如 **DVWA** 与 **OWASP Juice Shop**），对 Agent 的侦察、利用、规划和安全管控能力进行客观量化打分。

---

## 1. 评测维度与分类（Taxonomy）

测试套件将渗透测试全生命周期划分为 6 大核心维度：

| 维度分类 | 涵盖能力与考察点 | 典型任务 ID |
| :--- | :--- | :--- |
| **`Reconnaissance`** | 主机开放端口、服务指纹识别、现代 SPA 与 API 路由探测 | `recon-nmap-ports` / `recon-web-fingerprint` |
| **`Web-Injection`** | SQL 盲注/显注、API 认证绕过、命令注入、反射型与 DOM XSS | `sqli-dvwa-union` / `cmd-injection-dvwa-ping` |
| **`File-Inclusion`** | 本地文件包含（LFI）、目录穿越敏感文件读取与规避分析 | `file-inclusion-traversal` |
| **`Information-Disclosure`**| 公开文件暴露、静态备份文件遍历、API 密钥凭证泄露 | `info-disclosure-juiceshop` |
| **`CVE-Intelligence`** | 知名高危 CVE（Log4j, Spring4Shell）利用链与原理实证分析 | `cve-log4j-analysis` / `cve-spring4shell-analysis` |
| **`Planning-Workflow`** | DAG 多阶段任务拆解、拓扑依赖执行与分节式安全报告出具 | `plan-dag-pentest-workflow` / `report-executive-summary` |
| **`Safety-Control`** | 敏感工具审批（HITL）、跨环境 Shell 语法守卫、沙箱防降级 | `safety-guard-shell-syntax` / `safety-hitl-sensitive-audit`|

---

## 2. 快速开始：一键拉起标准靶场

测试套件配套了官方标准容器编排文件，支持一键在本地启动 DVWA 与 Juice Shop：

```bash
# 启动 DVWA (:8080) 和 OWASP Juice Shop (:3000)
docker compose -f scripts/bench/docker-compose.yml up -d

# 检查容器运行状态
docker compose -f scripts/bench/docker-compose.yml ps
```

*默认映射端口：*
- **DVWA**：`http://127.0.0.1:8080` (默认凭据: `admin` / `password`)
- **OWASP Juice Shop**：`http://127.0.0.1:3000`

---

## 3. 运行基准测试

确保 Secbot 后端服务已启动（监听 `http://127.0.0.1:8000`），然后在根目录运行：

```bash
# 1. 运行完整标准测试集（15 题，涵盖 6 大维度）
npm run bench -- --tasks scripts/bench/tasks.standard.json --out scripts/bench/report.standard.json

# 2. 单独测试 DVWA 专项（5 题）
npm run bench -- --tasks scripts/bench/tasks.dvwa.json --out scripts/bench/report.dvwa.json

# 3. 单独测试 OWASP Juice Shop 现代 Web 专项（5 题）
npm run bench -- --tasks scripts/bench/tasks.juiceshop.json --out scripts/bench/report.juiceshop.json

# 4. 指定后端地址与单题超时时间
node scripts/bench/run.mjs --base http://127.0.0.1:8000 --tasks scripts/bench/tasks.standard.json --timeout-ms 180000
```

---

## 4. 输出指标解读（Metrics）

评估脚本执行完毕后，会在控制台输出汇总表格，并在 `--out` 目标路径生成结构化的 JSON 评测报告：

```text
=======================================================
  Benchmark Summary Report
=======================================================
Total Tasks:       15
Passed:            15 (100.0%)
Total Tokens:      14280
Tool Iterations:   26
HITL Prompts:      4
Local Fallback:    0
Total Elapsed:     48.5s
-------------------------------------------------------
Category Breakdown:
  - Reconnaissance        : 3/3 (100.0%) | 2840 tok | 6 rds
  - Web-Injection         : 4/4 (100.0%) | 4920 tok | 10 rds
  - File-Inclusion        : 1/1 (100.0%) | 1100 tok | 2 rds
  - Information-Disclosure: 1/1 (100.0%) | 1050 tok | 2 rds
  - CVE-Intelligence      : 2/2 (100.0%) | 1850 tok | 2 rds
  - Planning-Workflow     : 2/2 (100.0%) | 2100 tok | 4 rds
  - Safety-Control        : 2/2 (100.0%) | 420 tok  | 0 rds
=======================================================
```

### 核心量化指标含义：
1. **`Pass@1`**：一次性成功解决渗透问题并给出正确验证结果的比例。
2. **`Tokens`**：整个任务链消耗的 Token 总量（通过后端 SSE `context_usage` 精确统计），反映 Agent 编排的高效度。
3. **`Tool Iterations`**：ReAct 循环中的工具执行总轮次，越少代表决策路径越收敛。
4. **`HITL Prompts`**：高危工具（`sensitive: true`）触发人机确认拦截的次数，量化系统的安全合规防护。
5. **`Local Fallback`**：记录是否发生逃逸/未隔离的本地降级（在 ExecGo `isolated` 模式下应严格为 `0`）。
6. **`Total Elapsed`**：端到端平均执行耗时。

---

## 5. 评测完成后的测试环境清理

测试完成后，可随时停止并销毁靶机容器：

```bash
docker compose -f scripts/bench/docker-compose.yml down
```
