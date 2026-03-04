import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('bridge', { recursive: true });

await build({
  entryPoints: ['dist/mcp/server.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'bridge/mcp-server.cjs',
  external: [],
  banner: {
    js: `
// claudemd-lint MCP Server
// Auto-resolve global npm modules
const _cp = require('child_process');
const _Module = require('module');
try {
  const _globalRoot = _cp.execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
  process.env.NODE_PATH = _globalRoot + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '');
  _Module._initPaths();
} catch {}
`.trim()
  }
});

console.log('✓ MCP server bundled to bridge/mcp-server.cjs');
