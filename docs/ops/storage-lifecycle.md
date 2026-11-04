# Storage lifecycle

## Key layout

```text
users/{userId}/references/{projectId|library}/…
users/{userId}/projects/{projectId}/scenes/…
users/{userId}/projects/{projectId}/final/…
```

Keys are validated by `assertSafeStorageKey` (no `..`, no absolute paths).

## Programmatic purge

```ts
import { purgeProjectPrefix } from '@ai-shorts-factory/storage';

await purgeProjectPrefix(storage, userId, projectId);
```

Deletes every object under `users/{user}/projects/{project}/`.

## Recommended R2 bucket rules

- Abort incomplete multipart uploads after 7 days
- Optional: lifecycle expire diagnostic/screenshot prefixes after 30 days
- Keep final MP4s until the project is soft-deleted, then run `purgeProjectPrefix`
- Never expose R2 secret keys to the browser; use signed URLs only

## Orphan cleanup

When projects are soft-deleted, enqueue a maintenance job (future Postgres queue) that calls `purgeProjectPrefix`. Until then, operators can run a one-off script using the storage factory against R2.
