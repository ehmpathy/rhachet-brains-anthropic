import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * .what = shape of a claude code hook entry in settings.json
 * .why = typed representation for read/write operations
 */
export interface ClaudeCodeHookEntry {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
  }>;
  author?: string; // rhachet namespace, ignored by claude code
}

/**
 * .what = valid claude code hook event names
 * .why = enables type-safe access to hooks section by key
 */
export type ClaudeCodeHookEventName =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop';

/**
 * .what = shape of .claude/settings.json
 * .why = enables typed read/write of claude code settings
 */
export interface ClaudeCodeSettings {
  hooks?: Partial<Record<ClaudeCodeHookEventName, ClaudeCodeHookEntry[]>>;
  [key: string]: unknown;
}

/**
 * .what = reads claude code settings from .claude/settings.json
 * .why = enables access to hook configuration for a repo
 */
export const readClaudeCodeSettings = async (input: {
  from: string;
}): Promise<ClaudeCodeSettings> => {
  const settingsPath = path.join(input.from, '.claude', 'settings.json');

  // check if file exists
  try {
    await fs.access(settingsPath);
  } catch {
    return {};
  }

  // read and parse the file
  const content = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(content) as ClaudeCodeSettings;
};

/**
 * .what = writes claude code settings to .claude/settings.json
 * .why = enables persistence of hook configuration for a repo
 */
export const writeClaudeCodeSettings = async (input: {
  settings: ClaudeCodeSettings;
  to: string;
}): Promise<void> => {
  const claudeDir = path.join(input.to, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  // ensure .claude directory exists
  await fs.mkdir(claudeDir, { recursive: true });

  // write with 2-space indent and newline at end
  const content = JSON.stringify(input.settings, null, 2) + '\n';
  await fs.writeFile(settingsPath, content, 'utf-8');
};
