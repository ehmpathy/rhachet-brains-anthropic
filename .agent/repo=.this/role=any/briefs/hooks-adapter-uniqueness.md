# hooks adapter uniqueness

## unique key

a BrainHook is uniquely identified by `author + event + command`

filter is NOT part of the unique key

## separation of concerns

rhachet declares what hooks should exist. the adapter ensures uniqueness in persistence.

since filter is not part of the unique key, the same hook (author+event+command) may have been persisted across multiple claude code matchers (e.g., Write, Edit, Write|Edit) due to filter changes over time.

the adapter is responsible for:
- ensuring a hook is uniquely represented in settings.json
- cleaning up orphans across all matchers on upsert
- translating rhachet's canonical format to claude code's matcher-based format

rhachet is NOT responsible for:
- knowing about claude code's matcher implementation
- orchestrating orphan cleanup across matchers
- understanding how filters map to matchers

## implementation

on `upsert`:
1. remove the hook (by author+command) from INCORRECT matcher entries (orphan cleanup)
2. if hook exists in correct matcher - update in place
3. if hook not in correct matcher - insert into correct matcher entry
4. clean up empty entries

on `del`:
1. remove the hook (by author+command) from ALL matcher entries
2. clean up empty entries

this ensures that when a hook's filter changes (e.g., from `Write` to `Write|Edit`), the adapter automatically cleans up the old representation while preserving the hook if already correct.
