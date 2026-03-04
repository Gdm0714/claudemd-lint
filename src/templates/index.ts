import fs from 'fs';
import path from 'path';
import type { Template, ProjectType } from '../types.js';
import { nextjsTemplate } from './nextjs.js';
import { pythonTemplate } from './python.js';
import { goTemplate } from './go.js';
import { genericTemplate } from './generic.js';

// ============================================================
// Template Registry
// ============================================================

const TEMPLATES: Template[] = [
  nextjsTemplate,
  pythonTemplate,
  goTemplate,
  genericTemplate,
];

// ============================================================
// Project Type Detection
// ============================================================

export function detectProjectType(cwd: string): ProjectType {
  for (const template of TEMPLATES) {
    if (template.projectType === 'generic') continue;
    for (const file of template.detectFiles) {
      if (fs.existsSync(path.join(cwd, file))) {
        return template.projectType;
      }
    }
  }
  return 'generic';
}

// ============================================================
// Template Lookup
// ============================================================

export function getTemplate(projectType: ProjectType): Template {
  const found = TEMPLATES.find((t) => t.projectType === projectType);
  return found ?? genericTemplate;
}

// ============================================================
// Auto Detection
// ============================================================

export function autoDetectTemplate(cwd: string): Template {
  const projectType = detectProjectType(cwd);
  return getTemplate(projectType);
}

// ============================================================
// Variable Auto-Detection
// ============================================================

export function detectVariables(cwd: string): Record<string, string> {
  const vars: Record<string, string> = {};

  // Detect package manager
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) {
    vars['packageManager'] = 'bun';
  } else if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    vars['packageManager'] = 'pnpm';
  } else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    vars['packageManager'] = 'yarn';
  } else {
    vars['packageManager'] = 'npm';
  }

  // Read package.json for JS/TS projects
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      vars['projectName'] = typeof pkg['name'] === 'string' ? pkg['name'] : path.basename(cwd);

      const deps = (pkg['dependencies'] ?? {}) as Record<string, string>;
      const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>;
      const allDeps = { ...deps, ...devDeps };

      if (typeof allDeps['next'] === 'string') {
        vars['nextVersion'] = allDeps['next'].replace(/[\^~]/, '');
      }
      if (typeof allDeps['react'] === 'string') {
        vars['reactVersion'] = allDeps['react'].replace(/[\^~]/, '');
      }

      // Detect styling
      if (allDeps['tailwindcss']) {
        vars['styling'] = 'Tailwind CSS';
      } else if (allDeps['styled-components']) {
        vars['styling'] = 'styled-components';
      } else if (allDeps['@emotion/react']) {
        vars['styling'] = 'Emotion';
      } else {
        vars['styling'] = 'CSS Modules';
      }
    } catch {
      vars['projectName'] = path.basename(cwd);
    }
  }

  // Read go.mod for Go projects
  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    try {
      const content = fs.readFileSync(goModPath, 'utf-8');
      const moduleMatch = content.match(/^module\s+(\S+)/m);
      const goMatch = content.match(/^go\s+(\S+)/m);
      if (moduleMatch) {
        vars['modulePath'] = moduleMatch[1];
        vars['projectName'] = vars['projectName'] ?? moduleMatch[1].split('/').pop() ?? path.basename(cwd);
      }
      if (goMatch) {
        vars['goVersion'] = goMatch[1];
      }
      vars['framework'] = '';
    } catch {
      // ignore
    }
  }

  // Read pyproject.toml for Python projects
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/^name\s*=\s*["'](.+?)["']/m);
      const pyMatch = content.match(/python\s*=\s*["'][^"']*?(\d+\.\d+)/m);
      if (nameMatch) vars['projectName'] = nameMatch[1];
      if (pyMatch) vars['pythonVersion'] = pyMatch[1];

      // Detect package manager
      if (content.includes('[tool.poetry]')) {
        vars['packageManager'] = 'poetry';
        vars['installCommand'] = 'poetry install';
        vars['runCommand'] = 'poetry run python -m {{projectName}}';
      } else if (content.includes('[tool.pdm]')) {
        vars['packageManager'] = 'pdm';
        vars['installCommand'] = 'pdm install';
        vars['runCommand'] = 'pdm run python -m {{projectName}}';
      } else {
        vars['packageManager'] = 'pip';
        vars['installCommand'] = 'pip install -e ".[dev]"';
        vars['runCommand'] = 'python -m {{projectName}}';
      }

      // Detect framework
      if (content.includes('fastapi')) {
        vars['framework'] = 'FastAPI';
      } else if (content.includes('django')) {
        vars['framework'] = 'Django';
      } else if (content.includes('flask')) {
        vars['framework'] = 'Flask';
      } else {
        vars['framework'] = '';
      }
    } catch {
      // ignore
    }
  } else if (fs.existsSync(path.join(cwd, 'requirements.txt'))) {
    try {
      const content = fs.readFileSync(path.join(cwd, 'requirements.txt'), 'utf-8');
      vars['packageManager'] = vars['packageManager'] ?? 'pip';
      vars['installCommand'] = 'pip install -r requirements.txt';
      vars['runCommand'] = 'python main.py';
      if (content.includes('fastapi')) vars['framework'] = 'FastAPI';
      else if (content.includes('django')) vars['framework'] = 'Django';
      else if (content.includes('flask')) vars['framework'] = 'Flask';
    } catch {
      // ignore
    }
  } else if (fs.existsSync(path.join(cwd, 'Pipfile'))) {
    vars['packageManager'] = 'pipenv';
    vars['installCommand'] = 'pipenv install --dev';
    vars['runCommand'] = 'pipenv run python -m {{projectName}}';
  }

  // Detect Python version from .python-version
  const pythonVersionPath = path.join(cwd, '.python-version');
  if (fs.existsSync(pythonVersionPath) && !vars['pythonVersion']) {
    try {
      vars['pythonVersion'] = fs.readFileSync(pythonVersionPath, 'utf-8').trim();
    } catch {
      // ignore
    }
  }

  // Fallback defaults
  vars['projectName'] = vars['projectName'] ?? path.basename(cwd);
  vars['description'] = vars['description'] ?? 'A software project';
  vars['language'] = vars['language'] ?? 'TypeScript';
  vars['framework'] = vars['framework'] ?? '';
  vars['pythonVersion'] = vars['pythonVersion'] ?? '3.12';
  vars['goVersion'] = vars['goVersion'] ?? '1.22';
  vars['nextVersion'] = vars['nextVersion'] ?? '';
  vars['reactVersion'] = vars['reactVersion'] ?? '';
  vars['styling'] = vars['styling'] ?? 'CSS Modules';
  vars['installCommand'] = vars['installCommand'] ?? `${vars['packageManager']} install`;
  vars['runCommand'] = vars['runCommand'] ?? `${vars['packageManager']} run dev`;
  vars['buildCommand'] = vars['buildCommand'] ?? `${vars['packageManager']} run build`;
  vars['testCommand'] = vars['testCommand'] ?? `${vars['packageManager']} test`;
  vars['conventions'] = vars['conventions'] ?? 'Follow project conventions';
  vars['modulePath'] = vars['modulePath'] ?? `github.com/user/${vars['projectName']}`;

  return vars;
}

// ============================================================
// Template Rendering
// ============================================================

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

export function fillTemplate(template: Template, variables: Record<string, string>): string {
  const lines: string[] = [];

  for (const section of template.sections) {
    const hashes = '#'.repeat(section.level);
    lines.push(`${hashes} ${section.heading}`);
    lines.push('');
    const content = interpolate(section.content, variables);
    lines.push(content);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export { TEMPLATES };
