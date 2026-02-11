# Skills and Memory System

Hackbot provides two powerful systems for knowledge management and context retention:

## Skills System

Markdown-based skills following the OpenAI Agent Skills standard.

### Directory Structure

```
skills/
├── base/                      # Base skills
│   └── nmap-usage/
│       ├── SKILL.md          # Skill manifest + instructions
│       ├── scripts/          # Optional scripts
│       ├── references/       # Optional references
│       └── assets/           # Optional assets
├── penetration/              # Penetration testing skills
├── enumeration/              # Enumeration skills
├── exploitation/             # Exploitation skills
└── reporting/                # Reporting skills
```

### SKILL.md Format

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
from skills.loader import SkillLoader

loader = SkillLoader(["./skills"])
skills = loader.load_all()

# Get skill by name
skill = loader.get_skill("nmap-usage")

# Get skills by trigger
matched = loader.get_skills_by_triggers("scan ports")

# List all skills
for skill_info in loader.list_skills():
    print(skill_info["name"], skill_info["description"])
```

---

## Memory System

Three-layer memory architecture inspired by OpenAI Agents SDK and CrewAI.

### Architecture

```
MemoryManager
├── ShortTermMemory    # Session context (deque, auto-trim)
├── EpisodicMemory     # Cross-session events (JSON file)
└── LongTermMemory    # Persistent knowledge (JSON file)
```

### Usage

```python
from core.memory.manager import MemoryManager

memory = MemoryManager()

# Remember something
await memory.remember(
    content="Target 192.168.1.10 has port 22 open",
    memory_type="episodic",
    importance=0.7,
    target="192.168.1.10"
)

# Recall memories
memories = await memory.recall("192.168.1.10")

# Get context for agent
context = await memory.get_context_for_agent("target information")

# Distill from conversation
await memory.distill_from_conversation(
    conversation=history,
    summary="Scanned target, found SSH service"
)
```

### Memory Types

| Type | Storage | Use Case |
|------|---------|----------|
| `short_term` | In-memory deque | Current session context |
| `episodic` | JSON file | Past events and experiences |
| `long_term` | JSON file | Persistent knowledge |

---

## Integration Example

```python
from skills.loader import SkillLoader
from core.memory.manager import MemoryManager

class HackbotAgent:
    def __init__(self):
        self.skills = SkillLoader(["./skills"]).load_all()
        self.memory = MemoryManager()
    
    async def process(self, message: str):
        # Get relevant skills
        relevant_skills = self.skills.get_skills_by_triggers(message)
        
        # Get memory context
        context = await self.memory.get_context_for_agent(message)
        
        # Build prompt with skills + memory
        prompt = self._build_prompt(message, relevant_skills, context)
        
        # Process and remember
        await self.memory.remember(message, "short_term")
        
        return response
```
