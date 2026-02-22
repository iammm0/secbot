import React from 'react';
import { Box, Text } from 'ink';
import type { StreamState } from './types.js';

interface MainContentProps {
  streamState: StreamState;
  streaming: boolean;
  apiOutput: string | null;
}

export function MainContent({ streamState, streaming, apiOutput }: MainContentProps) {
  const {
    phase,
    detail,
    planning,
    thought,
    thoughtChunks,
    actions,
    content,
    report,
    error,
    response,
  } = streamState;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
      {apiOutput !== null && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan" bold>
            [API]
          </Text>
          <Text>{apiOutput}</Text>
        </Box>
      )}
      {streaming && phase && (
        <Text color="yellow">
          {phase} {detail ? `— ${detail}` : ''}
        </Text>
      )}
      {error && (
        <Text color="red">错误: {error}</Text>
      )}
      {planning && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan" bold>
            规划
          </Text>
          {planning.content && <Text>{planning.content}</Text>}
          {planning.todos?.length > 0 &&
            planning.todos.map((t, i) => (
              <Text key={i} color="dim">
                - {t.content} {t.status ? `(${t.status})` : ''}
              </Text>
            ))}
        </Box>
      )}
      {thought && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="magenta" bold>
            推理 #{thought.iteration}
          </Text>
          <Text>{thought.content || thoughtChunks.get(thought.iteration) || '…'}</Text>
        </Box>
      )}
      {actions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>
            执行
          </Text>
          {actions.map((a, i) => (
            <Box key={i} flexDirection="column">
              <Text>
                {a.tool} {a.result !== undefined ? (a.success ? '✓' : '✗') : '…'}
              </Text>
              {a.error && <Text color="red">{a.error}</Text>}
            </Box>
          ))}
        </Box>
      )}
      {content && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="white" bold>
            内容
          </Text>
          <Text>{content}</Text>
        </Box>
      )}
      {report && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="blue" bold>
            报告
          </Text>
          <Text>{report}</Text>
        </Box>
      )}
      {response && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>
            回复
          </Text>
          <Text>{response}</Text>
        </Box>
      )}
    </Box>
  );
}
