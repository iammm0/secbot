# Skills and Memory System

This document matches the current Python package layout. Skills live under `secbot_agent/skills`, and memory utilities live under `secbot_agent/core/memory`.

## Skills System

Secbot loads Markdown-based skills from directories containing a `SKILL.md` file. The built-in root is:

```text
secbot_agent/skills/base/
```

Current built-in skills include:

- `command-execution`
- `nmap-usage`
- `system-commands`
- `system-control`
- `terminal-session`

### Directory Structure

```text
secbot_agent/skills/base/
├── nmap-usage/
│   └── SKILL.md
├── command-execution/
│   └── SKILL.md
└── terminal-session/
    └── SKILL.md
```

Each skill directory may also include optional `scripts/`, `references/`, and `assets/` directories. The loader reads these if present.

### `SKILL.md` Format

```markdown
---
name: skill-name
description: Explain when this skill should trigger
version: "1.0.0"
author: "Author name"
tags: ["tag1", "tag2"]
triggers: ["keyword1", "keyword2"]
prerequisites: ["requirement1"]
---

# Skill Instructions

Your skill content here...
```

### Usage

```python
from secbot_agent.skills.loader import SkillLoader

loader = SkillLoader()
skills = loader.load_all()

skill = loader.get_skill("nmap-usage")
matched = loader.get_skills_by_triggers("scan ports")

for skill_info in loader.list_skills():
    print(skill_info["name"], skill_info["description"])
```

To load an additional directory:

```python
from secbot_agent.skills.loader import SkillLoader

loader = SkillLoader(["/path/to/my/skills"])
loader.load_all()
```

## Memory System

The memory manager implements a three-layer memory architecture:

```text
MemoryManager
├── ShortTermMemory    # In-memory session context, backed by deque
├── EpisodicMemory     # Cross-session events, saved as JSON
└── LongTermMemory     # Persistent knowledge, saved as JSON
```

Default JSON files are written under `./data/` relative to the process working directory:

- `./data/episodic_memory.json`
- `./data/long_term_memory.json`

### Usage

```python
from secbot_agent.core.memory.manager import MemoryManager

memory = MemoryManager()

await memory.remember(
    content="Target 192.168.1.10 has port 22 open",
    memory_type="episodic",
    importance=0.7,
    target="192.168.1.10",
)

memories = await memory.recall("192.168.1.10")
context = await memory.get_context_for_agent("target information")

await memory.distill_from_conversation(
    conversation=history,
    summary="Scanned target and found SSH service",
)
```

### Memory Types

| Type | Storage | Use Case |
|------|---------|----------|
| `short_term` | In-memory deque | Current session context |
| `episodic` | JSON file | Past events and experiences |
| `long_term` | JSON file | Persistent knowledge |

## Database-backed Conversation Memory

For conversation persistence, use `DatabaseMemory`, which writes to the SQLite database through `DatabaseManager`.

```python
from secbot_agent.database.manager import DatabaseManager
from secbot_agent.core.memory.database_memory import DatabaseMemory

db = DatabaseManager()
memory = DatabaseMemory(db, agent_type="secbot-cli", session_id="session-123")

await memory.save_conversation("用户消息", "助手回复")
history = await memory.get(limit=10)
```

See [DATABASE_GUIDE.md](DATABASE_GUIDE.md) for database paths, API endpoints, and backup guidance.

## Integration Example

```python
from secbot_agent.skills.loader import SkillLoader
from secbot_agent.core.memory.manager import MemoryManager


class SecbotAgent:
    def __init__(self):
        self.skills = SkillLoader().load_all()
        self.memory = MemoryManager()

    async def process(self, message: str):
        relevant_skills = [
            skill.manifest.name
            for skill in self.skills.values()
            if any(trigger.lower() in message.lower() for trigger in skill.manifest.triggers)
        ]

        context = await self.memory.get_context_for_agent(message)
        prompt = self._build_prompt(message, relevant_skills, context)

        await self.memory.remember(message, "short_term")
        return await self._call_model(prompt)
```
