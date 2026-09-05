/**
 * .what = builds the options object handed to the claude-agent-sdk `query`
 * .why = the call site had this shape inline, which made its heaviest member —
 *   `settingSources` — unreachable by any test. the sdk `query` is reached only after a
 *   credential guard, so an inline options object can be proven ONLY by a live agent
 *   run. as a named transformer it is pure, so a unit test can assert the isolation
 *   directly and go red the moment a later edit drops it (`rule.require.named-transformers`).
 */

/**
 * .what = tools disallowed for readonly ask operations
 * .why = prevents mutations in research/analysis tasks
 */
export const TOOLS_DISALLOWED_FOR_ASK = [
  'Edit',
  'Write',
  'Bash',
  'NotebookEdit',
] as const;

/**
 * .what = tools allowed for read+write act operations
 * .why = enables full agentic capabilities for code changes
 */
export const TOOLS_ALLOWED_FOR_ACT = [
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'Task',
] as const;

export const asQueryOptions = (input: {
  systemPrompt: string | undefined;
  model: string;
  mode: 'ask' | 'act';
  jsonSchema: Record<string, unknown>;
}): Record<string, unknown> => ({
  systemPrompt: input.systemPrompt || undefined,
  model: input.model,

  // ask is readonly, so it blocks the mutators; act is privileged, so it names its grants
  ...(input.mode === 'ask'
    ? { disallowedTools: [...TOOLS_DISALLOWED_FOR_ASK] }
    : { allowedTools: [...TOOLS_ALLOWED_FOR_ACT] }),

  // ⚠️ REQUIRED, not a preference. omit this and the sdk loads EVERY filesystem config
  //   source — `~/.claude/settings.json`, the caller's project `.claude/settings.json`,
  //   `.claude/settings.local.json`, and `CLAUDE.md`. the sdk states it plainly:
  //   *"When omitted, all sources are loaded (matches CLI defaults). Pass `[]` to
  //   disable filesystem settings (SDK isolation mode)."*
  //
  // .why that is a defect and not a convenience = those sources carry HOOKS. a consumer
  //   who calls `.ask({ prompt })` from their own repo has their own `SessionStart` hook
  //   output injected into the agent's context, where it competes with — and can
  //   outrank — the prompt they passed. the same call, on two machines, yields two
  //   answers (`rule.forbid.unexpected-defaults`).
  //
  // ⚠️ this is a MEASURED failure, not a feared one. with this member absent, the live
  //   `genBrainRepl.integration.test.ts` `[case2]` asked for "hello from claude code"
  //   and got back a markdown status report about THIS repo's route stone — because our
  //   own `SessionStart` hook had injected it. the agent answered the ambient text
  //   rather than the caller.
  //
  // .why `[]` rather than `['project']` = `role.briefs` is this contract's ONE declared
  //   channel for context. to also load `CLAUDE.md` would give the agent a second,
  //   undeclared channel the caller never opted into and cannot see. a consumer who
  //   wants their project instructions passes them as a brief.
  //
  // .note = isolation covers CONFIG, not the filesystem. `act` mode still reads and
  //   writes in cwd exactly as before; only the ambient config is cut.
  settingSources: [],

  outputFormat: {
    type: 'json_schema',
    schema: input.jsonSchema,
  },
});
