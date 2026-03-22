import type {
  BlockEditorBlockAttributes,
  BlockEditorBlockSnapshot,
  BlockEditorDocumentSnapshot,
  BlockEditorParagraphType,
} from './types';

const PAGE_FLAVOUR = 'affine:page';
const NOTE_FLAVOUR = 'affine:note';

const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, '\n');

const trimBoundaryBlankLines = (value: string): string =>
  value.replace(/^\n+|\n+$/g, '');

const isSkippableFlavour = (flavour: string): boolean =>
  flavour === PAGE_FLAVOUR || flavour === NOTE_FLAVOUR;

const buildSyntheticBlockId = (
  documentId: string,
  suffix: string,
): string => `${documentId}:${suffix}`;

const getIndentDepth = (indentation: string): number => (
  Math.floor(indentation.replace(/\t/g, '  ').length / 2)
);

const isHeadingType = (value: string): value is Exclude<BlockEditorParagraphType, 'text' | 'quote'> => (
  value === 'h1'
  || value === 'h2'
  || value === 'h3'
  || value === 'h4'
  || value === 'h5'
  || value === 'h6'
);

interface ParsedContentBlock {
  readonly flavour: string;
  readonly depth: number;
  readonly text: string;
  readonly attributes: BlockEditorBlockAttributes | null;
}

const createParsedContentBlock = (
  flavour: string,
  depth: number,
  text: string,
  attributes: BlockEditorBlockAttributes | null = null,
): ParsedContentBlock => ({
  flavour,
  depth,
  text,
  attributes,
});

const isCodeFenceLine = (line: string): boolean => /^\s*```/.test(line);

const isTodoListLine = (line: string): boolean => /^(\s*)[-*]\s+\[[ xX]\]\s+/.test(line);

const isNumberedListLine = (line: string): boolean => /^(\s*)\d+\.\s+/.test(line);

const isBulletedListLine = (line: string): boolean => /^(\s*)[-*]\s+/.test(line);

const isHeadingLine = (line: string): boolean => /^\s{0,3}#{1,6}\s+/.test(line);

const isQuoteLine = (line: string): boolean => /^\s{0,3}>\s?/.test(line);

const isLatexFenceLine = (line: string): boolean => /^\s*\$\$/.test(line);

const isDividerLine = (line: string): boolean => (
  /^\s{0,3}(?:-\s*){3,}$/.test(line)
  || /^\s{0,3}(?:\*\s*){3,}$/.test(line)
  || /^\s{0,3}(?:_\s*){3,}$/.test(line)
);

const BOOKMARK_STANDALONE_LINK_LINE = /^\s*\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)\s*$/;
const BOOKMARK_AUTOLINK_LINE = /^\s*<((?:https?:\/\/|mailto:)[^>\s]+)>\s*$/;
const BOOKMARK_BARE_URL_LINE = /^\s*((?:https?:\/\/|mailto:)\S+)\s*$/;

const isHostname = (value: string, ...expectedHostnames: readonly string[]): boolean => (
  expectedHostnames.includes(value.toLowerCase())
);

const isYouTubeUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    return isHostname(
      parsedUrl.hostname,
      'youtu.be',
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
    );
  } catch {
    return false;
  }
};

const isLoomUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    return isHostname(
      parsedUrl.hostname,
      'loom.com',
      'www.loom.com',
    );
  } catch {
    return false;
  }
};

const isFigmaUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    return isHostname(
      parsedUrl.hostname,
      'figma.com',
      'www.figma.com',
    );
  } catch {
    return false;
  }
};

const isGitHubIssueOrPullRequestUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    if (!isHostname(parsedUrl.hostname, 'github.com', 'www.github.com')) {
      return false;
    }

    return /^\/[^/]+\/[^/]+\/(issues|pull)\/\d+\/?$/.test(parsedUrl.pathname);
  } catch {
    return false;
  }
};

const resolveStandaloneUrlFlavour = (value: string): string => {
  if (isYouTubeUrl(value)) {
    return 'affine:embed-youtube';
  }

  if (isLoomUrl(value)) {
    return 'affine:embed-loom';
  }

  if (isFigmaUrl(value)) {
    return 'affine:embed-figma';
  }

  if (isGitHubIssueOrPullRequestUrl(value)) {
    return 'affine:embed-github';
  }

  return 'affine:bookmark';
};

const isBlockBoundaryLine = (line: string): boolean => (
  isCodeFenceLine(line)
  || isTodoListLine(line)
  || isNumberedListLine(line)
  || isBulletedListLine(line)
  || isHeadingLine(line)
  || isQuoteLine(line)
  || isLatexFenceLine(line)
  || isDividerLine(line)
);

const finalizeContentBlocks = (
  documentId: string,
  blocks: readonly ParsedContentBlock[],
): readonly BlockEditorBlockSnapshot[] => {
  return blocks.map((block, index) => {
    let childCount = 0;

    for (let cursor = index + 1; cursor < blocks.length; cursor += 1) {
      const nextBlock = blocks[cursor];
      if (nextBlock.depth <= block.depth) {
        break;
      }

      if (nextBlock.depth === block.depth + 1) {
        childCount += 1;
      }
    }

    return {
      id: buildSyntheticBlockId(documentId, `block-${index + 1}`),
      flavour: block.flavour,
      depth: block.depth,
      childCount,
      text: block.text,
      attributes: block.attributes,
    };
  });
};

const parseMarkdownToContentBlocks = (
  markdown: string,
  documentId: string,
): readonly BlockEditorBlockSnapshot[] => {
  const normalizedMarkdown = normalizeLineEndings(markdown);
  const lines = normalizedMarkdown.split('\n');
  const parsedBlocks: ParsedContentBlock[] = [];

  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor] ?? '';
    if (line.trim().length === 0) {
      cursor += 1;
      continue;
    }

    const singleLineLatexMatch = line.match(/^\s*\$\$(.+?)\$\$\s*$/);
    if (singleLineLatexMatch) {
      parsedBlocks.push(createParsedContentBlock(
        'affine:latex',
        2,
        singleLineLatexMatch[1] ?? '',
      ));
      cursor += 1;
      continue;
    }

    if (isLatexFenceLine(line)) {
      const latexLines: string[] = [];
      cursor += 1;

      while (cursor < lines.length && !/^\s*\$\$\s*$/.test(lines[cursor] ?? '')) {
        latexLines.push(lines[cursor] ?? '');
        cursor += 1;
      }

      if (cursor < lines.length) {
        cursor += 1;
      }

      parsedBlocks.push(createParsedContentBlock(
        'affine:latex',
        2,
        latexLines.join('\n'),
      ));
      continue;
    }

    const codeFenceMatch = line.match(/^\s*```([^\n`]*)\s*$/);
    if (codeFenceMatch) {
      const codeLines: string[] = [];
      const language = codeFenceMatch[1]?.trim() || null;
      cursor += 1;

      while (cursor < lines.length && !/^\s*```/.test(lines[cursor] ?? '')) {
        codeLines.push(lines[cursor] ?? '');
        cursor += 1;
      }

      if (cursor < lines.length) {
        cursor += 1;
      }

      parsedBlocks.push(createParsedContentBlock(
        'affine:code',
        2,
        codeLines.join('\n'),
        {
          type: null,
          checked: null,
          order: null,
          language,
          url: null,
          caption: null,
        },
      ));
      continue;
    }

    const todoMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (todoMatch) {
      parsedBlocks.push(createParsedContentBlock(
        'affine:list',
        2 + getIndentDepth(todoMatch[1] ?? ''),
        todoMatch[3] ?? '',
        {
          type: 'todo',
          checked: (todoMatch[2] ?? '').toLowerCase() === 'x',
          order: null,
          language: null,
          url: null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      parsedBlocks.push(createParsedContentBlock(
        'affine:list',
        2 + getIndentDepth(numberedMatch[1] ?? ''),
        numberedMatch[3] ?? '',
        {
          type: 'numbered',
          checked: null,
          order: Number.parseInt(numberedMatch[2] ?? '1', 10),
          language: null,
          url: null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    const bulletedMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletedMatch) {
      parsedBlocks.push(createParsedContentBlock(
        'affine:list',
        2 + getIndentDepth(bulletedMatch[1] ?? ''),
        bulletedMatch[2] ?? '',
        {
          type: 'bulleted',
          checked: null,
          order: null,
          language: null,
          url: null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      parsedBlocks.push(createParsedContentBlock(
        'affine:paragraph',
        2,
        headingMatch[2] ?? '',
        {
          type: `h${headingMatch[1]?.length ?? 1}` as BlockEditorParagraphType,
          checked: null,
          order: null,
          language: null,
          url: null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = [];

      while (cursor < lines.length && isQuoteLine(lines[cursor] ?? '')) {
        quoteLines.push((lines[cursor] ?? '').replace(/^\s{0,3}>\s?/, ''));
        cursor += 1;
      }

      parsedBlocks.push(createParsedContentBlock(
        'affine:paragraph',
        2,
        quoteLines.join('\n'),
        {
          type: 'quote',
          checked: null,
          order: null,
          language: null,
          url: null,
          caption: null,
        },
      ));
      continue;
    }

    if (isDividerLine(line)) {
      parsedBlocks.push(createParsedContentBlock(
        'affine:divider',
        2,
        '',
      ));
      cursor += 1;
      continue;
    }

    const standaloneBookmarkLinkMatch = line.match(BOOKMARK_STANDALONE_LINK_LINE);
    if (standaloneBookmarkLinkMatch) {
      const targetUrl = standaloneBookmarkLinkMatch[2] ?? '';
      parsedBlocks.push(createParsedContentBlock(
        resolveStandaloneUrlFlavour(targetUrl),
        2,
        standaloneBookmarkLinkMatch[1] ?? '',
        {
          type: null,
          checked: null,
          order: null,
          language: null,
          url: targetUrl.length > 0 ? targetUrl : null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    const standaloneBookmarkAutolinkMatch = line.match(BOOKMARK_AUTOLINK_LINE);
    if (standaloneBookmarkAutolinkMatch) {
      const targetUrl = standaloneBookmarkAutolinkMatch[1] ?? '';
      parsedBlocks.push(createParsedContentBlock(
        resolveStandaloneUrlFlavour(targetUrl),
        2,
        targetUrl,
        {
          type: null,
          checked: null,
          order: null,
          language: null,
          url: targetUrl.length > 0 ? targetUrl : null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    const standaloneBookmarkUrlMatch = line.match(BOOKMARK_BARE_URL_LINE);
    if (standaloneBookmarkUrlMatch) {
      const targetUrl = standaloneBookmarkUrlMatch[1] ?? '';
      parsedBlocks.push(createParsedContentBlock(
        resolveStandaloneUrlFlavour(targetUrl),
        2,
        targetUrl,
        {
          type: null,
          checked: null,
          order: null,
          language: null,
          url: targetUrl.length > 0 ? targetUrl : null,
          caption: null,
        },
      ));
      cursor += 1;
      continue;
    }

    const paragraphLines: string[] = [line];
    cursor += 1;

    while (cursor < lines.length) {
      const nextLine = lines[cursor] ?? '';
      if (nextLine.trim().length === 0 || isBlockBoundaryLine(nextLine)) {
        break;
      }

      paragraphLines.push(nextLine);
      cursor += 1;
    }

    parsedBlocks.push(createParsedContentBlock(
      'affine:paragraph',
      2,
      paragraphLines.join('\n'),
    ));
  }

  if (parsedBlocks.length === 0) {
    parsedBlocks.push(createParsedContentBlock('affine:paragraph', 2, ''));
  }

  return finalizeContentBlocks(documentId, parsedBlocks);
};

const getSerializableContentBlocks = (
  snapshot: BlockEditorDocumentSnapshot,
): readonly BlockEditorBlockSnapshot[] => {
  const noteBlock = snapshot.blocks.find((block) => block.flavour === NOTE_FLAVOUR) ?? null;
  const minimumContentDepth = noteBlock === null ? 0 : noteBlock.depth;

  return snapshot.blocks.filter((block) => (
    !isSkippableFlavour(block.flavour)
    && block.depth > minimumContentDepth
  ));
};

const serializeParagraphBlock = (block: BlockEditorBlockSnapshot): string => {
  const paragraphType = block.attributes?.type;
  const text = normalizeLineEndings(block.text);

  if (paragraphType === 'quote') {
    return text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  }

  if (typeof paragraphType === 'string' && isHeadingType(paragraphType)) {
    return `${'#'.repeat(Number.parseInt(paragraphType.slice(1), 10))} ${text}`;
  }

  return text;
};

const serializeListBlock = (block: BlockEditorBlockSnapshot, baseDepth: number): string => {
  const listType = block.attributes?.type;
  const indentation = '  '.repeat(Math.max(0, block.depth - baseDepth - 1));
  const continuationIndentation = `${indentation}  `;
  const text = normalizeLineEndings(block.text)
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${continuationIndentation}${line}`))
    .join('\n');

  if (listType === 'numbered') {
    return `${indentation}${block.attributes?.order ?? 1}. ${text}`;
  }

  if (listType === 'todo') {
    return `${indentation}- [${block.attributes?.checked ? 'x' : ' '}] ${text}`;
  }

  return `${indentation}- ${text}`;
};

const serializeCodeBlock = (block: BlockEditorBlockSnapshot): string => {
  const text = normalizeLineEndings(block.text);
  const language = typeof block.attributes?.language === 'string'
    ? block.attributes.language.trim()
    : '';
  const fence = text.includes('```') ? '````' : '```';

  return `${fence}${language}\n${text}\n${fence}`;
};

const serializeLatexBlock = (block: BlockEditorBlockSnapshot): string => (
  `$$\n${normalizeLineEndings(block.text)}\n$$`
);

const serializeDividerBlock = (): string => '---';

const escapeMarkdownLinkLabel = (value: string): string => (
  value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
);

const serializeBookmarkBlock = (block: BlockEditorBlockSnapshot): string => {
  return serializeUrlBackedBlock(block);
};

const serializeUrlBackedBlock = (block: BlockEditorBlockSnapshot): string => {
  const url = typeof block.attributes?.url === 'string'
    ? block.attributes.url.trim()
    : '';

  if (url.length === 0) {
    return normalizeLineEndings(block.text);
  }

  const label = block.text.trim().length > 0
    ? block.text.trim()
    : typeof block.attributes?.caption === 'string'
      ? block.attributes.caption.trim()
      : '';

  if (label.length === 0 || label === url) {
    return url;
  }

  return `[${escapeMarkdownLinkLabel(label)}](${url})`;
};

const serializeContentBlock = (
  block: BlockEditorBlockSnapshot,
  baseDepth: number,
): string => {
  if (block.flavour === 'affine:list') {
    return serializeListBlock(block, baseDepth);
  }

  if (block.flavour === 'affine:code') {
    return serializeCodeBlock(block);
  }

  if (block.flavour === 'affine:paragraph') {
    return serializeParagraphBlock(block);
  }

  if (block.flavour === 'affine:latex') {
    return serializeLatexBlock(block);
  }

  if (block.flavour === 'affine:divider') {
    return serializeDividerBlock();
  }

  if (block.flavour === 'affine:bookmark') {
    return serializeBookmarkBlock(block);
  }

  if (block.flavour === 'affine:embed-youtube') {
    return serializeUrlBackedBlock(block);
  }

  if (block.flavour === 'affine:embed-loom') {
    return serializeUrlBackedBlock(block);
  }

  if (block.flavour === 'affine:embed-figma') {
    return serializeUrlBackedBlock(block);
  }

  if (block.flavour === 'affine:embed-github') {
    return serializeUrlBackedBlock(block);
  }

  return normalizeLineEndings(block.text);
};

const joinSerializedBlocks = (
  blocks: readonly BlockEditorBlockSnapshot[],
  baseDepth: number,
): string => {
  let output = '';

  blocks.forEach((block, index) => {
    const serializedBlock = serializeContentBlock(block, baseDepth);
    if (index === 0) {
      output = serializedBlock;
      return;
    }

    const previousBlock = blocks[index - 1];
    const separator = previousBlock.flavour === 'affine:list' && block.flavour === 'affine:list'
      ? '\n'
      : '\n\n';

    output += `${separator}${serializedBlock}`;
  });

  return output;
};

export interface CreateBlockEditorDocumentSnapshotFromMarkdownOptions {
  readonly documentId?: string;
}

export const normalizeBlockEditorMarkdown = (markdown: string): string =>
  normalizeLineEndings(markdown);

export const createBlockEditorDocumentSnapshotFromMarkdown = (
  markdown: string,
  options?: CreateBlockEditorDocumentSnapshotFromMarkdownOptions,
): BlockEditorDocumentSnapshot => {
  const documentId = options?.documentId?.trim() || 'block-document';
  const contentBlocks = parseMarkdownToContentBlocks(markdown, documentId);
  const noteChildCount = contentBlocks.filter((block) => block.depth === 2).length;
  const blocks: BlockEditorBlockSnapshot[] = [
    {
      id: buildSyntheticBlockId(documentId, 'page'),
      flavour: PAGE_FLAVOUR,
      depth: 0,
      childCount: 1,
      text: '',
      attributes: null,
    },
    {
      id: buildSyntheticBlockId(documentId, 'note'),
      flavour: NOTE_FLAVOUR,
      depth: 1,
      childCount: noteChildCount,
      text: '',
      attributes: null,
    },
    ...contentBlocks,
  ];

  const documentSnapshotWithoutPlainText: BlockEditorDocumentSnapshot = {
    documentId,
    blockCount: blocks.length,
    textBlockCount: blocks.filter((block) => block.text.length > 0).length,
    plainText: '',
    blocks,
  };

  return {
    ...documentSnapshotWithoutPlainText,
    plainText: serializeBlockEditorDocumentSnapshotToMarkdown(documentSnapshotWithoutPlainText),
  };
};

export const serializeBlockEditorDocumentSnapshotToMarkdown = (
  snapshot: BlockEditorDocumentSnapshot,
): string => {
  const noteBlock = snapshot.blocks.find((block) => block.flavour === NOTE_FLAVOUR) ?? null;
  const contentBlocks = getSerializableContentBlocks(snapshot);

  if (contentBlocks.length === 0) {
    return trimBoundaryBlankLines(normalizeLineEndings(snapshot.plainText));
  }

  return trimBoundaryBlankLines(joinSerializedBlocks(contentBlocks, noteBlock?.depth ?? 1));
};
