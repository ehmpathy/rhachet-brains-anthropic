import { toMilliseconds } from 'iso-time';
import type { BrainHook, BrainHookEvent } from 'rhachet';

import type {
  ClaudeCodeHook,
  ClaudeCodeHookEntry,
  ClaudeCodeHookEventName,
} from './config.dao';

/**
 * .what = maps rhachet BrainHookEvent to claude code hook event name
 * .why = claude code uses different event names than rhachet
 */
const EVENT_MAP: Record<BrainHookEvent, ClaudeCodeHookEventName> = {
  onBoot: 'SessionStart',
  onTool: 'PreToolUse',
  onStop: 'Stop',
};

/**
 * .what = reverse map from claude code event to rhachet event
 * .why = enables lookup when read from claude code settings
 */
const REVERSE_EVENT_MAP: Record<string, BrainHookEvent> = {
  SessionStart: 'onBoot',
  PreToolUse: 'onTool',
  Stop: 'onStop',
};

/**
 * .what = translates a rhachet BrainHook to claude code hook format
 * .why = bridges rhachet hook model to claude code settings.json structure
 */
export const translateHookToClaudeCode = (input: {
  hook: BrainHook;
}): {
  event: ClaudeCodeHookEventName;
  matcher: string;
  hook: ClaudeCodeHook;
} => {
  const { hook } = input;

  // determine the matcher based on filter
  const matcher = hook.filter?.what ?? '*';

  // convert IsoDuration to seconds for claude code
  const timeoutSeconds = Math.round(toMilliseconds(hook.timeout) / 1000);

  // build the claude code hook with author inside
  const claudeHook: ClaudeCodeHook = {
    type: 'command',
    command: hook.command,
    ...(timeoutSeconds && { timeout: timeoutSeconds }),
    author: hook.author,
  };

  return {
    event: EVENT_MAP[hook.event],
    matcher,
    hook: claudeHook,
  };
};

/**
 * .what = translates a claude code hook entry back to rhachet BrainHook
 * .why = enables read of hooks from claude code settings
 *
 * .note = each hook in the entry becomes a separate BrainHook
 * .note = author is read from each hook, defaults to 'unknown'
 */
export const translateHookFromClaudeCode = (input: {
  event: string;
  entry: ClaudeCodeHookEntry;
}): BrainHook[] => {
  const { event, entry } = input;

  // reverse map event name
  const rhachetEvent = REVERSE_EVENT_MAP[event];
  if (!rhachetEvent) return [];

  // each hook in the entry becomes a separate BrainHook
  return entry.hooks.map((h) => ({
    author: h.author ?? 'unknown',
    event: rhachetEvent,
    command: h.command,
    timeout: h.timeout ? { seconds: h.timeout } : { seconds: 30 },
    ...(entry.matcher !== '*' && {
      filter: { what: entry.matcher },
    }),
  }));
};
