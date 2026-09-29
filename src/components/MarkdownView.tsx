import React from 'react';
import Markdown from 'react-native-markdown-display';

interface Props {
  content: string;
}

const markdownStyles = {
  body: { color: '#2D2016', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#2D2016', fontWeight: '700' as const },
  heading2: { color: '#2D2016', fontWeight: '600' as const },
  code_block: { backgroundColor: '#F5EDE3', padding: 8, borderRadius: 4 },
  code_inline: { backgroundColor: '#F5EDE3', paddingHorizontal: 4, borderRadius: 4 },
  blockquote: { borderLeftColor: '#C17A3A', borderLeftWidth: 3, paddingLeft: 12 },
};

export default function MarkdownView({ content }: Props) {
  return <Markdown style={markdownStyles}>{content}</Markdown>;
}
