import type { Template } from '../types.js';

export const goTemplate: Template = {
  name: 'Go',
  projectType: 'go',
  detectFiles: ['go.mod', 'go.sum'],
  sections: [
    {
      heading: 'Project Overview',
      level: 1,
      content: '{{projectName}} — Go {{goVersion}} project\n\nModule: `{{modulePath}}`',
    },
    {
      heading: 'Tech Stack',
      level: 2,
      content: '- Go {{goVersion}}\n- Module: {{modulePath}}\n- {{framework}}',
    },
    {
      heading: 'Build & Run',
      level: 2,
      content: '```bash\n# Download dependencies\ngo mod download\n\n# Run\ngo run ./...\n\n# Build\ngo build -o bin/{{projectName}} ./...\n\n# Format & vet\ngo fmt ./...\ngo vet ./...\n```',
      autoFill: true,
    },
    {
      heading: 'Directory Structure',
      level: 2,
      content: '- `cmd/` — Entry points (main packages)\n- `internal/` — Private application code\n- `pkg/` — Public library code\n- `go.mod` — Module definition\n- `go.sum` — Dependency checksums',
    },
    {
      heading: 'Conventions',
      level: 2,
      content: '- Run `go fmt ./...` before committing\n- Run `go vet ./...` to catch common mistakes\n- Handle all errors explicitly — never ignore with `_`\n- Prefer table-driven tests\n- Keep interfaces small (one or two methods)\n- Use `context.Context` as the first parameter for long-running operations\n- Avoid global state; pass dependencies explicitly',
    },
    {
      heading: 'Testing',
      level: 2,
      content: '```bash\ngo test ./...\ngo test -race ./...\ngo test -cover ./...\n```',
    },
  ],
};
