import type { BrainHook, BrainHookEvent, BrainHooksAdapter } from 'rhachet';

import type {
  ClaudeCodeHook,
  ClaudeCodeHookEntry,
  ClaudeCodeHookEventName,
} from './config.dao';
import { readClaudeCodeSettings, writeClaudeCodeSettings } from './config.dao';
import {
  translateHookFromClaudeCode,
  translateHookToClaudeCode,
} from './translateHook';

/**
 * .what = maps rhachet event to claude code event name
 * .why = used for deletion lookup
 */
const EVENT_MAP: Record<BrainHookEvent, ClaudeCodeHookEventName> = {
  onBoot: 'SessionStart',
  onTool: 'PreToolUse',
  onStop: 'Stop',
};

/**
 * .what = creates a claude code brain hooks adapter for a repo
 * .why = enables rhachet to sync role hooks to .claude/settings.json
 */
export const genBrainHooksAdapterForClaudeCode = (input: {
  repoPath: string;
}): BrainHooksAdapter => {
  const { repoPath } = input;

  return {
    slug: 'claude-code',
    dao: {
      get: {
        /**
         * .what = finds a single hook by unique key
         * .why = enables lookup before upsert
         */
        async one(query) {
          const { author, event, command } = query.by.unique;
          const all = await this.all();
          return (
            all.find(
              (h) =>
                h.author === author &&
                h.event === event &&
                h.command === command,
            ) ?? null
          );
        },

        /**
         * .what = lists all hooks, optionally filtered
         * .why = enables enumeration for sync and display
         */
        async all(query?) {
          const settings = await readClaudeCodeSettings({ from: repoPath });
          const hooks: BrainHook[] = [];

          // iterate over all hook events in settings
          const hooksSection = settings.hooks ?? {};
          for (const [eventName, entries] of Object.entries(hooksSection)) {
            if (!entries) continue;
            for (const entry of entries) {
              // translate each entry to BrainHook(s)
              const translated = translateHookFromClaudeCode({
                event: eventName,
                entry,
              });
              hooks.push(...translated);
            }
          }

          // apply filters if provided
          let result = hooks;
          if (query?.by?.author) {
            result = result.filter((h) => h.author === query.by?.author);
          }
          if (query?.by?.event) {
            result = result.filter((h) => h.event === query.by?.event);
          }
          if (query?.by?.command) {
            result = result.filter((h) => h.command === query.by?.command);
          }

          return result;
        },
      },

      set: {
        /**
         * .what = inserts hook if not found, returns found if present
         * .why = idempotent insert for initial sync
         */
        async findsert(query) {
          const { hook } = query;

          // check if hook already exists
          const hookFound = await this.upsert({ hook });
          return hookFound;
        },

        /**
         * .what = inserts or updates a hook
         * .why = enables sync to update hooks declaratively
         */
        async upsert(query) {
          const { hook } = query;
          const settings = await readClaudeCodeSettings({ from: repoPath });

          // translate to claude code format
          const {
            event,
            matcher,
            hook: claudeHook,
          } = translateHookToClaudeCode({ hook });

          // ensure hooks section exists
          const hooksSection = settings.hooks ?? {};
          const eventHooks = [...(hooksSection[event] ?? [])];

          // find entry with same matcher
          const entryIndex = eventHooks.findIndex(
            (e: ClaudeCodeHookEntry) => e.matcher === matcher,
          );

          if (entryIndex >= 0) {
            // entry exists - find and replace or append hook
            const entry = eventHooks[entryIndex] as ClaudeCodeHookEntry;
            const hookIndex = entry.hooks.findIndex(
              (h: ClaudeCodeHook) =>
                h.author === hook.author && h.command === hook.command,
            );

            if (hookIndex >= 0) {
              // replace hook
              entry.hooks[hookIndex] = claudeHook;
            } else {
              // append hook to entry
              entry.hooks.push(claudeHook);
            }
          } else {
            // create new entry with this hook
            eventHooks.push({
              matcher,
              hooks: [claudeHook],
            });
          }

          // write back
          const settingsUpdated = {
            ...settings,
            hooks: {
              ...hooksSection,
              [event]: eventHooks,
            },
          };

          await writeClaudeCodeSettings({
            settings: settingsUpdated,
            to: repoPath,
          });

          return hook;
        },
      },

      /**
       * .what = removes a hook by unique key
       * .why = enables cleanup when role hooks change
       */
      async del(query) {
        const { author, event, command } = query.by.unique;
        const settings = await readClaudeCodeSettings({ from: repoPath });

        // map event to claude code event name
        const claudeEvent = EVENT_MAP[event];

        // find and remove hook from entries
        const hooksSection = settings.hooks ?? {};
        const eventHooks = [...(hooksSection[claudeEvent] ?? [])];
        let didChange = false;

        for (const entry of eventHooks) {
          const hookIndex = entry.hooks.findIndex(
            (h: ClaudeCodeHook) => h.author === author && h.command === command,
          );
          if (hookIndex >= 0) {
            entry.hooks.splice(hookIndex, 1);
            didChange = true;
          }
        }

        // remove empty entries
        const filtered = eventHooks.filter(
          (e: ClaudeCodeHookEntry) => e.hooks.length > 0,
        );

        // write back if changed
        if (didChange) {
          const settingsUpdated = {
            ...settings,
            hooks: {
              ...hooksSection,
              [claudeEvent]: filtered,
            },
          };

          await writeClaudeCodeSettings({
            settings: settingsUpdated,
            to: repoPath,
          });
        }
      },
    },
  };
};
