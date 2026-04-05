/**
 * 占位空白行 — 与虚拟滚动的逻辑行数对齐，拉开块间距
 */
import React from "react";
import { Box, Text } from "ink";

interface SpacerBlockProps {
  body: string;
  noMargin?: boolean;
}

export function SpacerBlock({ body, noMargin }: SpacerBlockProps) {
  const lines = (body || " ").split("\n");
  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 0}>
      {lines.map((line, i) => (
        <Text key={i}> </Text>
      ))}
    </Box>
  );
}
