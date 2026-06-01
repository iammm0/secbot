import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CreateSkillRequestDto, SkillDetailDto, SkillSummaryDto } from './dto/skills.dto';
import { SkillFrontmatter, SkillRecord } from './skills.types';

const FRONTMATTER_BOUNDARY = '---';
const DEFAULT_DESCRIPTION = 'Custom Secbot skill.';
const DEFAULT_AUTHOR = 'Secbot';
const DEFAULT_VERSION = '1.0.0';
const SKILL_FILE_NAME = 'SKILL.md';

function buildDefaultBody(name: string, description: string, triggers: string[]): string {
  return [
    '# Overview',
    '',
    description,
    '',
    '## When to use',
    '',
    `Use this skill when working on ${name.replace(/-/g, ' ')} tasks.`,
    '',
    '## Triggers',
    '',
    ...(triggers.length ? triggers.map((trigger) => `- ${trigger}`) : ['- add-trigger-here']),
    '',
    '## Notes',
    '',
    '- Replace this scaffold with task-specific guidance.',
  ].join('\n');
}

@Injectable()
export class SkillsService {
  private readonly workspaceRoot = process.env.SECBOT_WORKSPACE_ROOT?.trim() || process.cwd();

  async listSkills(): Promise<SkillSummaryDto[]> {
    const records = await this.loadAllSkills();
    return records.map((record) => this.toSummary(record));
  }

  async getSkill(nameOrSlug: string): Promise<SkillDetailDto> {
    const record = await this.findSkill(nameOrSlug);
    if (!record) {
      throw new NotFoundException(`Skill not found: ${nameOrSlug}`);
    }
    return this.toDetail(record);
  }

  async createSkill(input: CreateSkillRequestDto): Promise<SkillDetailDto> {
    const slug = this.slugify(input.name);
    const relativeDir = path.posix.join('skills', 'custom', slug);
    const dirPath = path.join(this.workspaceRoot, relativeDir);
    const filePath = path.join(dirPath, SKILL_FILE_NAME);

    await fs.mkdir(dirPath, { recursive: true });
    const exists = await this.exists(filePath);
    if (exists) {
      throw new Error(`Skill already exists: ${slug}`);
    }

    const description = (input.description || DEFAULT_DESCRIPTION).trim();
    const triggers = this.normalizeList(
      input.triggers && input.triggers.length ? input.triggers : [slug],
    );

    const record: SkillRecord = {
      name: slug,
      description,
      version: (input.version || DEFAULT_VERSION).trim(),
      author: (input.author || DEFAULT_AUTHOR).trim(),
      tags: this.normalizeList(input.tags),
      triggers,
      prerequisites: this.normalizeList(input.prerequisites),
      slug,
      scope: 'custom',
      relativeDir,
      body: (input.body || buildDefaultBody(slug, description, triggers)).trimEnd(),
    };

    await fs.writeFile(filePath, this.renderSkill(record), 'utf8');
    return this.toDetail(record);
  }

  private async loadAllSkills(): Promise<SkillRecord[]> {
    const root = path.join(this.workspaceRoot, 'skills');
    if (!(await this.exists(root))) {
      return [];
    }

    const skillFiles = await this.collectSkillFiles(root);
    const records = await Promise.all(skillFiles.map((filePath) => this.readSkillFile(filePath)));
    return records.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  private async findSkill(nameOrSlug: string): Promise<SkillRecord | null> {
    const needle = this.slugify(nameOrSlug);
    const skills = await this.loadAllSkills();
    return skills.find((item) => item.slug === needle || item.name === needle) ?? null;
  }

  private async readSkillFile(filePath: string): Promise<SkillRecord> {
    const raw = await fs.readFile(filePath, 'utf8');
    const { frontmatter, body } = this.splitFrontmatter(raw);
    const parsed = this.parseFrontmatter(frontmatter);
    const relativeDir = path
      .relative(this.workspaceRoot, path.dirname(filePath))
      .split(path.sep)
      .join('/');
    const parts = relativeDir.split('/');
    const slug = this.slugify(parsed.name || parts[parts.length - 1] || 'skill');
    const scope = parts[1] || 'custom';

    return {
      ...parsed,
      name: parsed.name || slug,
      slug,
      scope,
      relativeDir,
      body: body.trim(),
    };
  }

  private splitFrontmatter(text: string): { frontmatter: string; body: string } {
    const normalized = text.replace(/^﻿/, '');
    if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
      return { frontmatter: '', body: normalized.trim() };
    }

    const end = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);
    if (end === -1) {
      return { frontmatter: '', body: normalized.trim() };
    }

    const frontmatter = normalized.slice(FRONTMATTER_BOUNDARY.length + 1, end);
    const body = normalized.slice(end + `\n${FRONTMATTER_BOUNDARY}\n`.length);
    return { frontmatter, body };
  }

  private parseFrontmatter(text: string): SkillFrontmatter {
    const defaults: SkillFrontmatter = {
      name: '',
      description: DEFAULT_DESCRIPTION,
      version: DEFAULT_VERSION,
      author: DEFAULT_AUTHOR,
      tags: [],
      triggers: [],
      prerequisites: [],
    };
    if (!text.trim()) return defaults;

    const lines = text.split(/\r?\n/);
    const data: Record<string, string | string[]> = {};

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.trim()) continue;
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) continue;
      const [, key, rest] = match;
      const value = rest.trim();
      if (value === '|') {
        const block: string[] = [];
        let j = i + 1;
        while (j < lines.length && (/^\s{2,}/.test(lines[j]) || lines[j].trim() === '')) {
          block.push(lines[j].replace(/^\s{2}/, ''));
          j += 1;
        }
        data[key] = block.join('\n').trim();
        i = j - 1;
        continue;
      }
      if (value === '') {
        const list: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const listMatch = lines[j].match(/^\s*-\s+(.*)$/);
          if (!listMatch) break;
          list.push(listMatch[1].trim());
          j += 1;
        }
        if (list.length > 0) {
          data[key] = list;
          i = j - 1;
          continue;
        }
      }
      data[key] = this.parseFrontmatterValue(value);
    }

    return {
      name: this.firstString(data.name) || defaults.name,
      description: this.firstString(data.description) || defaults.description,
      version: this.firstString(data.version) || defaults.version,
      author: this.firstString(data.author) || defaults.author,
      tags: this.listValue(data.tags),
      triggers: this.listValue(data.triggers),
      prerequisites: this.listValue(data.prerequisites),
    };
  }

  private parseFrontmatterValue(value: string): string | string[] {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(',')
        .map((item) => item.trim().replace(/^['\"]|['\"]$/g, ''))
        .filter(Boolean);
    }
    return trimmed.replace(/^['\"]|['\"]$/g, '');
  }

  private listValue(value: string | string[] | undefined): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return this.normalizeList(value);
    return this.normalizeList(value.split(',').map((item) => item.trim()));
  }

  private firstString(value: string | string[] | undefined): string {
    if (!value) return '';
    return Array.isArray(value) ? value[0] || '' : value;
  }

  private normalizeList(values?: string[]): string[] {
    return (values ?? []).map((item) => item.trim()).filter(Boolean);
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'custom-skill';
  }

  private renderSkill(record: SkillRecord): string {
    const lines = [
      FRONTMATTER_BOUNDARY,
      `name: ${record.name}`,
      'description: |',
      ...record.description.split(/\r?\n/).map((line) => `  ${line}`),
      `version: \"${record.version}\"`,
      `author: \"${record.author}\"`,
      `tags: [${record.tags.map((item) => `\"${item}\"`).join(', ')}]`,
      `triggers: [${record.triggers.map((item) => `\"${item}\"`).join(', ')}]`,
      `prerequisites: [${record.prerequisites.map((item) => `\"${item}\"`).join(', ')}]`,
      FRONTMATTER_BOUNDARY,
      '',
      record.body,
      '',
    ];
    return lines.join('\n');
  }

  private toSummary(record: SkillRecord): SkillSummaryDto {
    return {
      name: record.name,
      description: record.description,
      version: record.version,
      author: record.author,
      tags: record.tags,
      triggers: record.triggers,
      prerequisites: record.prerequisites,
      slug: record.slug,
      scope: record.scope,
      relativeDir: record.relativeDir,
    };
  }

  private toDetail(record: SkillRecord): SkillDetailDto {
    return {
      ...this.toSummary(record),
      body: record.body,
    };
  }

  private async collectSkillFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.collectSkillFiles(fullPath)));
      } else if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
