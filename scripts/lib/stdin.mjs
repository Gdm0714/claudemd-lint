/**
 * Shared stdin reader with timeout protection.
 * Used by all hook scripts.
 */

/**
 * Read all data from stdin with a timeout.
 * @param {number} timeoutMs - Maximum time to wait for stdin (default: 5000ms)
 * @returns {Promise<string>} The raw stdin data as a string
 */
export function readStdin(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }, timeoutMs);

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });

    process.stdin.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });
  });
}

/**
 * Extract a field from JSON input with fallback.
 * @param {string} input - Raw JSON string
 * @param {string} field - Field name to extract
 * @param {*} defaultValue - Default value if field not found
 * @returns {*} The field value or default
 */
export function extractJsonField(input, field, defaultValue = '') {
  try {
    const data = JSON.parse(input);
    return data[field] ?? defaultValue;
  } catch {
    const match = input.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'));
    return match ? match[1] : defaultValue;
  }
}

/**
 * Extract the user's prompt from various hook input formats.
 * @param {string} input - Raw JSON string from stdin
 * @returns {string} The extracted prompt text
 */
export function extractPrompt(input) {
  try {
    const data = JSON.parse(input);
    if (data.prompt) return data.prompt;
    if (data.message?.content) return data.message.content;
    if (Array.isArray(data.parts)) {
      return data.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Create a standard hook output object.
 * @param {string} hookEventName - The hook event name
 * @param {string|null} additionalContext - Context to inject, or null for pass-through
 * @returns {object} Hook output JSON
 */
export function createHookOutput(hookEventName, additionalContext = null) {
  if (additionalContext) {
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName,
        additionalContext,
      },
    };
  }
  return { continue: true };
}

/**
 * Get the storage directory for this plugin's data.
 * @param {string} cwd - Current working directory
 * @returns {string} Path to .claudemd-lint directory
 */
export function getStorageDir(cwd) {
  return `${cwd}/.claudemd-lint`;
}
