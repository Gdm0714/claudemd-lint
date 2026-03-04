import type { Template } from '../types.js';

export const pythonTemplate: Template = {
  name: 'Python',
  projectType: 'python',
  detectFiles: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  sections: [
    {
      heading: 'Project Overview',
      level: 1,
      content: '{{projectName}} — Python {{pythonVersion}} project',
    },
    {
      heading: 'Tech Stack',
      level: 2,
      content: '- Python {{pythonVersion}}\n- {{framework}}\n- {{packageManager}} (package manager)\n- pytest (testing)\n- ruff / black (linting & formatting)\n- mypy (type checking)',
    },
    {
      heading: 'Setup & Run',
      level: 2,
      content: '```bash\n# Create and activate virtual environment\npython -m venv .venv\nsource .venv/bin/activate  # Windows: .venv\\Scripts\\activate\n\n# Install dependencies\n{{installCommand}}\n\n# Run the application\n{{runCommand}}\n```',
      autoFill: true,
    },
    {
      heading: 'Directory Structure',
      level: 2,
      content: '- `src/` or `{{projectName}}/` — Main package\n- `tests/` — Test suite\n- `pyproject.toml` — Project metadata & dependencies\n- `.venv/` — Virtual environment (not committed)',
    },
    {
      heading: 'Conventions',
      level: 2,
      content: '- Always activate the virtual environment before running commands\n- Use type hints for all function signatures\n- Follow PEP 8 style (enforced by ruff/black)\n- Keep imports sorted (isort / ruff)\n- Use `pathlib.Path` over `os.path`\n- Prefer dataclasses or pydantic models over plain dicts',
    },
    {
      heading: 'Testing',
      level: 2,
      content: '```bash\npytest\npytest --cov={{projectName}} --cov-report=term-missing\n```',
    },
    {
      heading: 'Linting',
      level: 2,
      content: '```bash\nruff check .\nruff format .\nmypy {{projectName}}/\n```',
    },
  ],
};
