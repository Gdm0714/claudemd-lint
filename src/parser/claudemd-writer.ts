import type { ClaudeMdDocument, ClaudeMdSection } from '../types.js';

/**
 * Convert a structured ClaudeMdDocument back to markdown string.
 */
export function writeClaudeMd(doc: ClaudeMdDocument): string {
  const parts: string[] = [];

  function writeSection(section: ClaudeMdSection, depth: number = 0): void {
    if (section.heading) {
      const prefix = '#'.repeat(section.level);
      parts.push(`${prefix} ${section.heading}`);
      parts.push('');
    }

    if (section.content.trim()) {
      parts.push(section.content.trim());
      parts.push('');
    }

    for (const child of section.children) {
      writeSection(child, depth + 1);
    }
  }

  for (const section of doc.sections) {
    writeSection(section);
  }

  // Clean up excessive blank lines
  let result = parts.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim() + '\n';

  return result;
}

/**
 * Add a rule to a specific section, creating the section if needed.
 */
export function addRuleToSection(
  doc: ClaudeMdDocument,
  sectionHeading: string,
  ruleText: string,
  level: number = 2
): ClaudeMdDocument {
  const sections = [...doc.sections];
  let targetSection = findSectionByHeading(sections, sectionHeading);

  if (!targetSection) {
    // Create the section
    targetSection = {
      id: '',
      heading: sectionHeading,
      level,
      content: '',
      rules: [],
      children: [],
    };
    sections.push(targetSection);
  }

  // Add the rule as a bullet point
  const bulletRule = `- ${ruleText}`;
  targetSection.content = targetSection.content.trim()
    ? `${targetSection.content.trim()}\n${bulletRule}`
    : bulletRule;

  return {
    ...doc,
    sections,
  };
}

/**
 * Remove a rule from a document by its text.
 */
export function removeRule(doc: ClaudeMdDocument, ruleText: string): ClaudeMdDocument {
  const sections = doc.sections.map((s) => removeRuleFromSection(s, ruleText));
  return { ...doc, sections };
}

function removeRuleFromSection(section: ClaudeMdSection, ruleText: string): ClaudeMdSection {
  const lines = section.content.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.replace(/^[\s*+-]*\d*\.?\s*/, '').trim();
    return trimmed !== ruleText.trim();
  });

  return {
    ...section,
    content: filtered.join('\n'),
    children: section.children.map((c) => removeRuleFromSection(c, ruleText)),
  };
}

function findSectionByHeading(
  sections: ClaudeMdSection[],
  heading: string
): ClaudeMdSection | null {
  const lower = heading.toLowerCase();
  for (const section of sections) {
    if (section.heading.toLowerCase() === lower) return section;
    const found = findSectionByHeading(section.children, heading);
    if (found) return found;
  }
  return null;
}
