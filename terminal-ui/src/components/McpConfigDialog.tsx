import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { api } from '../api/api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { isInkEscape } from '../contexts/KeybindContext.js';

interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
}

interface McpConnection {
  id: string;
  name: string;
  connected: boolean;
  tools: string[];
  error?: string;
}

interface McpCatalog {
  servers: McpServer[];
  loaded_tools: string[];
  omitted: number;
  errors: string[];
  connections: McpConnection[];
}

type Field = 'name' | 'command' | 'args' | 'cwd' | 'save';

const FIELDS: Field[] = ['name', 'command', 'args', 'cwd', 'save'];

export function McpConfigDialog() {
  const theme = useTheme();
  const { pop } = useDialog();
  const [catalog, setCatalog] = useState<McpCatalog | null>(null);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [field, setField] = useState<Field>('name');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [cwd, setCwd] = useState('');
  const [selected, setSelected] = useState(0);

  const load = () => {
    api
      .get<McpCatalog>('/api/settings/mcp')
      .then((data) => {
        setCatalog(data);
        setMessage(`已加载 ${data.loaded_tools?.length ?? 0} 个工具`);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  };

  useEffect(() => {
    load();
  }, []);

  const save = () => {
    const parsedArgs = args
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    void api
      .post('/api/settings/mcp', {
        name: name.trim(),
        command: command.trim(),
        args: parsedArgs,
        cwd: cwd.trim() || undefined,
      })
      .then(() => {
        setAdding(false);
        setName('');
        setCommand('');
        setArgs('');
        setCwd('');
        load();
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  };

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      if (editing) {
        setEditing(false);
        return;
      }
      if (adding) {
        setAdding(false);
        return;
      }
      pop();
      return;
    }
    if (adding) {
      if (editing) return;
      if (key.upArrow) {
        setField(
          (current) => FIELDS[(FIELDS.indexOf(current) + FIELDS.length - 1) % FIELDS.length],
        );
        return;
      }
      if (key.downArrow) {
        setField((current) => FIELDS[(FIELDS.indexOf(current) + 1) % FIELDS.length]);
        return;
      }
      if (key.return) {
        if (field === 'save') save();
        else setEditing(true);
      }
      return;
    }
    const count = catalog?.servers.length ?? 0;
    if (key.upArrow && count > 0) {
      setSelected((index) => (index === 0 ? count - 1 : index - 1));
      return;
    }
    if (key.downArrow && count > 0) {
      setSelected((index) => (index + 1) % count);
      return;
    }
    if (input === 'a') {
      setAdding(true);
      setField('name');
      return;
    }
    if (input === 'r') {
      load();
      return;
    }
    if ((input === 'd' || key.delete) && catalog && count > 0) {
      const server = catalog.servers[selected];
      if (!server) return;
      void api
        .delete(`/api/settings/mcp/${encodeURIComponent(server.id)}`)
        .then(() => load())
        .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }
  });

  const valueOf = (id: Field) => {
    if (id === 'name') return name;
    if (id === 'command') return command;
    if (id === 'args') return args;
    if (id === 'cwd') return cwd;
    return '';
  };
  const setValue = (id: Field, value: string) => {
    if (id === 'name') setName(value);
    else if (id === 'command') setCommand(value);
    else if (id === 'args') setArgs(value);
    else if (id === 'cwd') setCwd(value);
  };

  return (
    <Box flexDirection="column" paddingX={1} minWidth={72}>
      <Text bold color={theme.primary}>
        MCP 服务器（/mcp）
      </Text>
      <Text color={theme.textMuted}>
        a 添加 · d 删除 · r 刷新 · Esc 关闭。工具名形如 mcp__服务器__工具。
      </Text>
      <Text color={theme.textMuted}>{message}</Text>
      {catalog?.errors?.map((item) => (
        <Text key={item} color={theme.warning}>
          {item}
        </Text>
      ))}
      {(catalog?.servers ?? []).map((server, index) => {
        const connection = catalog?.connections?.find((item) => item.id === server.id);
        const mark = index === selected ? '> ' : '  ';
        return (
          <Box key={server.id} flexDirection="column">
            <Text color={index === selected ? theme.primary : theme.text}>
              {mark}
              {server.name} {connection?.connected ? '[已连接]' : '[未连接]'} {server.command}
            </Text>
            {connection?.tools?.length ? (
              <Text color={theme.textMuted}> {connection.tools.join(', ')}</Text>
            ) : null}
            {connection?.error ? <Text color={theme.warning}> {connection.error}</Text> : null}
          </Box>
        );
      })}
      {adding ? (
        <Box flexDirection="column" marginTop={1}>
          {FIELDS.filter((id) => id !== 'save').map((id) => (
            <Box key={id} flexDirection="column">
              <Text color={field === id ? theme.primary : theme.text}>
                {field === id ? '> ' : '  '}
                {id}: {editing && field === id ? '' : valueOf(id) || '(空)'}
              </Text>
              {editing && field === id ? (
                <TextInput
                  value={valueOf(id)}
                  onChange={(value) => setValue(id, value)}
                  onSubmit={() => setEditing(false)}
                />
              ) : null}
            </Box>
          ))}
          <Text color={field === 'save' ? theme.primary : theme.text}>
            {field === 'save' ? '> ' : '  '}保存
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
