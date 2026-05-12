import { describe, expect, it } from 'vitest';
import {
  extractFinalAnswer,
  hasFinalAnswer,
  parseToolAction,
} from './parse-tool-action';

describe('parseToolAction', () => {
  it('解析标准单行 Action', () => {
    const out = parseToolAction(
      'Thought: 我需要扫端口\nAction: {"tool":"port_scan","params":{"host":"1.2.3.4"}}',
    );
    expect(out).toEqual({
      tool: 'port_scan',
      params: { host: '1.2.3.4' },
    });
  });

  it('参数对象为空时仍能解析', () => {
    const out = parseToolAction(
      'Thought: 收集系统信息\n\nAction:\n\n{"tool": "system_info", "params": {}}',
    );
    expect(out).toEqual({ tool: 'system_info', params: {} });
  });

  it('嵌套对象参数也能解析（不会被 lazy regex 截断）', () => {
    const out = parseToolAction(
      'Action: {"tool":"complex","params":{"a":{"b":1},"c":[1,2,3]}}',
    );
    expect(out?.tool).toBe('complex');
    expect(out?.params).toEqual({ a: { b: 1 }, c: [1, 2, 3] });
  });

  it('Action 被 markdown 粗体包裹', () => {
    const out = parseToolAction(
      '**Thought:** 需要查 CVE\n\n**Action:** {"tool":"vuln_db_query","params":{"cve_id":"CVE-2021-44228"}}',
    );
    expect(out?.tool).toBe('vuln_db_query');
    expect(out?.params).toEqual({ cve_id: 'CVE-2021-44228' });
  });

  it('JSON 被 ```json``` 代码块包裹', () => {
    const out = parseToolAction(
      [
        'Thought: 我用浏览器搜一下',
        'Action:',
        '```json',
        '{"tool": "browser_session", "params": {"action":"search","query":"log4j","session_id":"s1"}}',
        '```',
      ].join('\n'),
    );
    expect(out?.tool).toBe('browser_session');
    expect(out?.params).toMatchObject({ action: 'search', session_id: 's1' });
  });

  it('中文动作标签也能解析', () => {
    const out = parseToolAction(
      '思考：需要扫端口\n行动：{"tool":"port_scan","params":{"host":"10.0.0.1"}}',
    );
    expect(out?.tool).toBe('port_scan');
  });

  it('Final Answer 出现时返回 null（让上层走最终回复）', () => {
    expect(
      parseToolAction(
        'Thought: 已经够了\nFinal Answer: 所有端口都关闭',
      ),
    ).toBeNull();
  });

  it('既无 Action 也无 Final Answer 时返回 null', () => {
    expect(parseToolAction('好的，我会处理这个问题。')).toBeNull();
  });

  it('JSON 非法时返回 null（不要抛错）', () => {
    expect(
      parseToolAction('Action: {tool: bad_json, params: not-an-object'),
    ).toBeNull();
  });

  it('hasFinalAnswer / extractFinalAnswer 支持中英文', () => {
    expect(hasFinalAnswer('Thought: ok\nFinal Answer: done')).toBe(true);
    expect(hasFinalAnswer('思考: 好\n最终回答: 完成')).toBe(true);
    expect(extractFinalAnswer('Thought: ok\nFinal Answer: 全部完成')).toBe(
      '全部完成',
    );
    expect(extractFinalAnswer('最终结论：业务正常')).toBe('业务正常');
  });
});
