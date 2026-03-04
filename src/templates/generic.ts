import type { Template } from '../types.js';

export const genericTemplate: Template = {
  name: 'Generic',
  projectType: 'generic',
  detectFiles: [],
  sections: [
    {
      heading: 'Project Overview',
      level: 1,
      content: '{{projectName}} — {{description}}',
    },
    {
      heading: 'Tech Stack',
      level: 2,
      content: '- {{language}}\n- {{framework}}\n- {{packageManager}}',
    },
    {
      heading: 'Build & Run',
      level: 2,
      content: '```bash\n{{installCommand}}\n{{runCommand}}\n{{buildCommand}}\n```',
      autoFill: true,
    },
    {
      heading: 'Directory Structure',
      level: 2,
      content: '- `src/` — Source code\n- `tests/` — Test suite\n- `docs/` — Documentation',
    },
    {
      heading: 'Conventions',
      level: 2,
      content: '- {{conventions}}',
    },
    {
      heading: 'Testing',
      level: 2,
      content: '```bash\n{{testCommand}}\n```',
    },
  ],
};
