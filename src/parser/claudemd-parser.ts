import { createHash } from 'node:crypto';
import type { ClaudeMdDocument, ClaudeMdSection, ClaudeMdRule, RuleType } from '../types.js';

/**
 * Generate a stable ID from content via SHA-256 hash (first 12 chars).
 */
function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * Parse a CLAUDE.md file into a structured document.
 */
export function parseClaudeMd(filePath: string, content: string): ClaudeMdDocument {
  const lines = content.split('\n');
  const rootSection: ClaudeMdSection = {
    id: contentHash(filePath + ':root'),
    heading: '',
    level: 0,
    content: '',
    rules: [],
    children: [],
  };

  const stack: ClaudeMdSection[] = [rootSection];
  let currentLines: string[] = [];
  let lineOffset = 0;

  function flushContent(): void {
    if (stack.length === 0) return;
    const current = stack[stack.length - 1];
    const text = currentLines.join('\n');
    current.content += (current.content ? '\n' : '') + text;
    const rules = extractRulesFromContent(text, current.id, lineOffset - currentLines.length);
    current.rules.push(...rules);
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    lineOffset = i + 1;

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      flushContent();

      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      const section: ClaudeMdSection = {
        id: contentHash(filePath + ':' + heading + ':' + level),
        heading,
        level,
        content: '',
        rules: [],
        children: [],
      };

      // Pop stack until we find a parent with lower level
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(section);
      stack.push(section);
    } else {
      currentLines.push(line);
    }
  }

  flushContent();

  return {
    filePath,
    sections: rootSection.children.length > 0 ? rootSection.children : [rootSection],
    rawContent: content,
  };
}

/**
 * Extract individual rules from a content block.
 */
function extractRulesFromContent(
  content: string,
  sectionId: string,
  startLine: number
): ClaudeMdRule[] {
  const rules: ClaudeMdRule[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = startLine + i;

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        codeBlockLines.push(line);
        const text = codeBlockLines.join('\n');
        rules.push({
          id: contentHash(text),
          text,
          type: 'codeblock',
          sectionId,
          line: codeBlockStart,
        });
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
        codeBlockStart = lineNum;
        codeBlockLines = [line];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Bullet points
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch) {
      const text = bulletMatch[2].trim();
      if (text.length > 10) {
        rules.push({
          id: contentHash(text),
          text,
          type: 'bullet',
          sectionId,
          line: lineNum,
        });
      }
      continue;
    }

    // Numbered lists
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numberedMatch) {
      const text = numberedMatch[1].trim();
      if (text.length > 10) {
        rules.push({
          id: contentHash(text),
          text,
          type: 'numbered',
          sectionId,
          line: lineNum,
        });
      }
      continue;
    }

    // Table rows (skip header separator)
    const tableMatch = line.match(/^\|(.+)\|$/);
    if (tableMatch && !line.match(/^\|[\s-|]+\|$/)) {
      const text = tableMatch[1].trim();
      if (text.length > 10) {
        rules.push({
          id: contentHash(text),
          text,
          type: 'table-row',
          sectionId,
          line: lineNum,
        });
      }
      continue;
    }

    // Paragraphs (non-empty, non-heading, substantial text)
    const trimmed = line.trim();
    if (trimmed.length > 30 && !trimmed.startsWith('#') && !trimmed.startsWith('|')) {
      rules.push({
        id: contentHash(trimmed),
        text: trimmed,
        type: 'paragraph',
        sectionId,
        line: lineNum,
      });
    }
  }

  return rules;
}

/**
 * Get all rules from a document, flattened.
 */
export function getAllRules(doc: ClaudeMdDocument): ClaudeMdRule[] {
  const rules: ClaudeMdRule[] = [];

  function collectRules(section: ClaudeMdSection): void {
    rules.push(...section.rules);
    for (const child of section.children) {
      collectRules(child);
    }
  }

  for (const section of doc.sections) {
    collectRules(section);
  }

  return rules;
}

/**
 * Find a section by heading (case-insensitive partial match).
 */
export function findSection(
  doc: ClaudeMdDocument,
  heading: string
): ClaudeMdSection | null {
  const lower = heading.toLowerCase();

  function search(sections: ClaudeMdSection[]): ClaudeMdSection | null {
    for (const section of sections) {
      if (section.heading.toLowerCase().includes(lower)) return section;
      const found = search(section.children);
      if (found) return found;
    }
    return null;
  }

  return search(doc.sections);
}
