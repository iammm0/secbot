# 技能/插件系统范式

基于 Markdown 的技能加载、清单解析与按需注入，与具体业务无关。

## 1. 技能目录约定

- 每个技能一个目录，目录内至少包含 `SKILL.md`。
- 可选：`scripts/`（可执行脚本）、`references/`（参考文档）、`assets/`（二进制或静态资源）。
- 加载器只认「目录 + SKILL.md」，其他目录可选扫描。

## 2. SKILL.md 与 Frontmatter

- **格式**：YAML frontmatter + Markdown 正文。用正则解析即可一次拆出 frontmatter 与正文：

```typescript
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

function parseFrontmatter(content: string) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: content };
  return {
    meta: parseYaml(match[1]),
    body: match[2],
  };
}
```

- **清单字段建议**：`name`、`description`（必填）、`version`、`author`、`tags`、`triggers`、`prerequisites`。description 用于发现与注入时的匹配。
- **正文**：即「技能说明」内容，注入到系统提示或上下文时直接拼接。

## 3. 加载器职责

- 扫描若干技能根目录（如 `["./skills"]`），对每个子目录查找 `SKILL.md`。
- 解析 frontmatter → 得到清单（TypeScript `interface`）；正文 → 作为 instructions。

```typescript
interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  triggers?: string[];
  prerequisites?: string[];
}

interface Skill {
  manifest: SkillManifest;
  instructions: string;
  path: string;
}
```

- 可选：同时加载同目录下 `scripts/`、`references/`、`assets/` 的路径或内容，放入 Skill 对象，便于按名引用。
- 结果以 `Map<string, Skill>` 缓存，提供 `getSkill(name)`、`getSkillsByTag(tag)`、`getSkillsByTriggers(query)`、`listSkills()` 等方法。

## 4. 按需注入

- **触发匹配**：根据用户 query 与技能的 `triggers`、`tags` 做简单匹配（如 `triggers.some(t => query.includes(t))`），可带权重（trigger 加权高于 tag），取 Top-K 个技能。
- **注入位置**：在调用 LLM 前，将选中技能的 instructions 拼接到系统提示词末尾，或作为单独「技能上下文」块，并打上明确分隔标记（如 `=== RELEVANT SKILLS ===`），避免与主提示混淆。
- **生命周期**：可在「处理前」注入、在「处理后」记录本轮使用了哪些技能，便于日志与统计；不必在每次请求时重新加载所有技能文件。

## 5. 与智能体集成

- 在 NestJS 中，技能加载器可封装为 `@Injectable()` 的 `SkillService`，通过依赖注入提供给 Agent。

```typescript
@Injectable()
export class SkillService {
  private skills = new Map<string, Skill>();

  constructor() {
    this.loadSkills(['./skills']);
  }

  inject(query: string, systemPrompt: string): string {
    const matched = this.matchSkills(query);
    if (matched.length === 0) return systemPrompt;
    const skillBlock = matched.map(s => s.instructions).join('\n\n');
    return `${systemPrompt}\n\n=== RELEVANT SKILLS ===\n${skillBlock}`;
  }

  private matchSkills(query: string): Skill[] {
    // 按 triggers / tags 匹配，返回 Top-K
  }

  private loadSkills(dirs: string[]): void {
    // 扫描目录，解析 SKILL.md
  }
}
```

- Agent 在 `process()` 方法中调用 `skillService.inject(query, systemPrompt)` 获取增强后的提示词，不必改基类。

## 6. 可复用要点小结

- 技能 = 目录 + SKILL.md（YAML frontmatter + Markdown）。
- 清单字段：`name`、`description`、`version`、`tags`、`triggers` 等，用 TypeScript `interface` 定义。
- 加载器：多目录扫描、解析、`Map` 缓存；按 name/tag/trigger 查询。
- 注入器：按 query 匹配技能、Top-K、拼接到系统提示或上下文块。
- 与 Agent 解耦：通过 NestJS 依赖注入提供 `SkillService`，Agent 在处理前调用注入方法。
