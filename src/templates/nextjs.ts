import type { Template } from '../types.js';

export const nextjsTemplate: Template = {
  name: 'Next.js',
  projectType: 'nextjs',
  detectFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
  sections: [
    { heading: 'Project Overview', level: 1, content: '{{projectName}} — Built with Next.js + {{packageManager}}' },
    { heading: 'Tech Stack', level: 2, content: '- Next.js {{nextVersion}}\n- React {{reactVersion}}\n- TypeScript\n- {{styling}}' },
    { heading: 'Build & Run', level: 2, content: '```bash\n{{packageManager}} install\n{{packageManager}} run dev\n{{packageManager}} run build\n```', autoFill: true },
    { heading: 'Directory Structure', level: 2, content: '- `app/` or `pages/` — Routes\n- `components/` — Reusable components\n- `lib/` — Utilities\n- `public/` — Static assets' },
    { heading: 'Conventions', level: 2, content: '- Use Server Components by default\n- Client components need "use client" directive\n- Route params are async in Next.js 15+' },
    { heading: 'Testing', level: 2, content: '```bash\n{{packageManager}} test\n```' },
  ],
};
