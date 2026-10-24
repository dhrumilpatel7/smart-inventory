import { Fragment } from 'react';

function inlineParts(text) {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*)/g;
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default function AssistantMessage({ content = '' }) {
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = null;
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') }); paragraph = []; };
  const flushList = () => { if (list.length) blocks.push({ type: listType, items: list }); list = []; listType = null; };

  content.replace(/\r/g, '').split('\n').forEach((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/);
    if (!trimmed) { flushParagraph(); flushList(); }
    else if (match) {
      flushParagraph();
      const nextType = /^\d/.test(trimmed) ? 'ol' : 'ul';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      list.push(match[1]);
    } else { flushList(); paragraph.push(trimmed); }
  });
  flushParagraph();
  flushList();

  return <div className="assistant-rich-text">{blocks.map((block, index) => {
    if (block.type === 'p') return <p key={index}>{inlineParts(block.text)}</p>;
    const List = block.type;
    return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineParts(item)}</li>)}</List>;
  })}</div>;
}
