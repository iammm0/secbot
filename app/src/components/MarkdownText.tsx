// ===================================================================
// Markdown 渲染 — 使用 react-native-markdown-display，主题与聊天块一致
// ===================================================================

import React from 'react';
import { Linking } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Colors, FontSize } from '../theme';

const markdownStyles = {
  body: {},
  text: {
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  heading1: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: '700' as const },
  heading2: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '700' as const },
  heading3: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '600' as const },
  heading4: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' as const },
  heading5: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' as const },
  heading6: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' as const },
  strong: { color: Colors.text, fontWeight: '700' as const },
  em: { color: Colors.text, fontStyle: 'italic' as const },
  s: { color: Colors.textMuted, textDecorationLine: 'line-through' as const },
  link: { color: Colors.primary },
  blockquote: {
    backgroundColor: Colors.surfaceLight,
    borderLeftColor: Colors.primary,
    borderLeftWidth: 4,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  code_inline: {
    backgroundColor: Colors.codeBackground,
    color: Colors.primary,
    fontSize: FontSize.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: Colors.codeBackground,
    color: Colors.text,
    fontSize: FontSize.sm,
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: Colors.codeBackground,
    color: Colors.text,
    fontSize: FontSize.sm,
    padding: 12,
    borderRadius: 6,
    marginVertical: 8,
  },
  bullet_list_icon: { color: Colors.textMuted },
  ordered_list_icon: { color: Colors.textMuted },
  list_item: { color: Colors.text },
  hr: { backgroundColor: Colors.border, height: 1, marginVertical: 12 },
  table: { borderColor: Colors.border },
  th: { color: Colors.text, padding: 8, borderColor: Colors.border },
  tr: { borderColor: Colors.border },
  td: { color: Colors.text, padding: 8, borderColor: Colors.border },
};

interface Props {
  content: string;
}

export default function MarkdownText({ content }: Props) {
  if (!content || !content.trim()) {
    return null;
  }

  return (
    <Markdown
      style={markdownStyles}
      mergeStyle={true}
      onLinkPress={(url) => {
        Linking.openURL(url);
        return false;
      }}
    >
      {content}
    </Markdown>
  );
}
