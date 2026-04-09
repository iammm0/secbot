"""
Skills 工作流程示例
展示技能如何在智能体处理过程中被加载和注入
"""

"""
工作流程:

1. 初始化阶段
   ├── 加载 secbot_agent/skills/base 下的内置技能（可传自定义目录覆盖）
   ├── 解析每个 SKILL.md (frontmatter + instructions)
   └── 缓存到内存

2. 查询匹配阶段
   ├── 接收用户查询
   ├── 提取触发词 (triggers) 和标签 (tags)
   └── 评分排序，返回 top 3 相关技能

3. 提示词注入阶段
   ├── 将技能内容追加到系统提示词
   └── 生成增强的提示词

4. Agent 执行
   └── 使用增强后的提示词进行推理

5. 后处理
       └── 记录使用的技能到会话
"""

"""
使用示例:

```python
from secbot_agent.skills import SkillInjector, integrate_skills_with_agent

# 方式 1: 手动使用
injector = SkillInjector()  # 默认加载包内 base/ 技能

# 原始系统提示词
system_prompt = "你是 Hackbot，一个安全测试助手..."

# 用户查询
query = "使用 nmap 扫描 192.168.1.0/24 网段"

# 注入相关技能
enhanced_prompt = injector.inject_into_prompt(query, system_prompt)

# 方式 2: 集成到 Agent
from secbot_agent.core.agents.hackbot_agent import HackbotAgent
from secbot_agent.skills import integrate_skills_with_agent

agent = HackbotAgent()
integrate_skills_with_agent(agent)

# 自动注入技能
enhanced_prompt = agent._enhance_prompt_with_skills(user_input)
```

```markdown
<!-- 技能触发示例 -->

用户: "nmap 扫描内网"
      ↓
提取触发词: ["nmap", "scan"]
      ↓
匹配技能: nmap-usage
      ↓
注入到提示词:

=== RELEVANT SKILLS ===

--- SKILL: nmap-usage ---
# Nmap Professional Scanning Techniques

## Timing Optimization
Aggressive: nmap -T4 -sS <target>
Stealth: nmap -T2 -sS -f --data-length 50 <target>

## Port Selection
nmap --top-ports 100 <target>
nmap -p- <target>

... (完整技能内容)
```
"""
