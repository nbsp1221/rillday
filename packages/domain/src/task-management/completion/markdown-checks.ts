import type { Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';

export function resetChecks(markdown: string) {
  const ast = fromMarkdown(markdown, {
    extensions: [gfmTaskListItem()],
    mdastExtensions: [gfmTaskListItemFromMarkdown()],
  });
  const positions: number[] = [];

  function walk(node: Root | RootContent) {
    if (node.type === 'listItem' && node.checked === true) {
      const start = node.position?.start.offset;
      if (start === undefined) {
        return;
      }
      const end = node.children[0]?.position?.start.offset ?? start + 8;
      const segment = markdown.slice(start, end);
      const match = /\[[xX]\]/.exec(segment);
      if (match) {
        positions.push(start + match.index + 1);
      }
    }
    if ('children' in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  walk(ast);
  let out = markdown;
  for (const p of positions.sort((a, b) => b - a)) {
    out = out.slice(0, p) + ' ' + out.slice(p + 1);
  }
  return out;
}
