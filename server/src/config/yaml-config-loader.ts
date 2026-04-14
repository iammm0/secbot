/**
 * YAML 配置文件加载器 — 将 data/config.yaml 解析为扁平 key-value，
 * 供 NestJS ConfigService 使用，并与 SQLite 保持单向同步（YAML → SQLite 默认值）。
 */
import * as fs from 'fs';
import * as path from 'path';

/** YAML 解析为嵌套对象（不依赖第三方库，手动解析基础 YAML） */
function parseYaml(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = text.split('\n');
    const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: result }];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = line.search(/\S/);
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;

        const key = trimmed.slice(0, colonIdx).trim().replace(/['"]/g, '');
        let value = trimmed.slice(colonIdx + 1).trim();

        // 去掉注释部分
        const commentIdx = value.indexOf('#');
        if (commentIdx !== -1) {
            // 确保不在引号内
            const before = value.slice(0, commentIdx);
            if (!before.includes('"') || (before.match(/"/g) || []).length % 2 === 0) {
                value = before.trim();
            }
        }

        // 去掉引号
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // 布尔/数字转换
        if (value === 'true') value = true as unknown as string;
        else if (value === 'false') value = false as unknown as string;
        else if (value !== '' && !Number.isNaN(Number(value))) value = Number(value) as unknown as string;

        // 处理嵌套层级
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        if (value === '' || value === undefined) {
            // 新对象
            const newObj: Record<string, unknown> = {};
            stack[stack.length - 1].obj[key] = newObj;
            stack.push({ indent, obj: newObj });
        } else {
            stack[stack.length - 1].obj[key] = value;
        }
    }

    return result;
}

/** 将嵌套对象扁平化为 dot-notation key */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            Object.assign(result, flatten(value as Record<string, unknown>, fullKey));
        } else {
            result[fullKey] = String(value ?? '');
        }
    }
    return result;
}

/** YAML dot-notation key 转环境变量风格（大写 + 下划线） */
function toEnvKey(dotKey: string): string {
    return dotKey.replace(/\./g, '_').toUpperCase();
}

export interface YamlConfigResult {
    /** 扁平化的配置（dot-notation key → value） */
    flat: Record<string, string>;
    /** 环境变量格式（UPPER_SNAKE_CASE → value） */
    envFormat: Record<string, string>;
}

/**
 * 加载 config.yaml，返回扁平化配置
 * @param rootDir 项目根目录
 */
export function loadYamlConfig(rootDir: string): YamlConfigResult {
    const yamlPath = path.join(rootDir, 'data', 'config.yaml');

    if (!fs.existsSync(yamlPath)) {
        return { flat: {}, envFormat: {} };
    }

    const content = fs.readFileSync(yamlPath, 'utf-8');
    const parsed = parseYaml(content);
    const flat = flatten(parsed);
    const envFormat: Record<string, string> = {};

    for (const [key, value] of Object.entries(flat)) {
        envFormat[toEnvKey(key)] = value;
    }

    return { flat, envFormat };
}

/** 嵌套对象写入 config.yaml（覆盖式） */
export function saveYamlConfig(rootDir: string, config: Record<string, unknown>): void {
    const yamlPath = path.join(rootDir, 'data', 'config.yaml');
    const dir = path.dirname(yamlPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const yamlContent = objectToYaml(config);
    fs.writeFileSync(yamlPath, yamlContent, 'utf-8');
}

/** 简单对象转 YAML（缩进 2 空格） */
function objectToYaml(obj: Record<string, unknown>, indent = 0): string {
    const lines: string[] = [];
    const pad = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            lines.push(`${pad}${key}:`);
            lines.push(objectToYaml(value as Record<string, unknown>, indent + 1));
        } else {
            const strVal = value === undefined || value === null ? '""' : String(value);
            // 字符串加引号
            const safeVal = typeof value === 'string' && !/^[0-9]+$/.test(strVal) && strVal !== 'true' && strVal !== 'false'
                ? `"${strVal}"`
                : strVal;
            lines.push(`${pad}${key}: ${safeVal}`);
        }
    }

    return lines.join('\n');
}
