# Frontend tests

Run the complete suite from `frontend/`:

```sh
npm run test:run
```

Vitest uses isolated worker threads, capped at 12 or the machine's available
parallelism, whichever is smaller. File isolation remains enabled. Override the
cap when measuring another machine with `--maxWorkers=4`, for example.

Two projects share the existing coverage configuration:

- `dom`: React components, hooks, browser storage, and DOM-dependent services.
  Uses jsdom and `src/setupTests.ts`.
- `unit`: the explicit `nodeTestFiles` list in `vite.config.ts`. Pure utilities
  and services with mocked network dependencies use Node without jsdom or browser
  setup. Native File/Blob are sufficient for the file utility tests in this list.

Every test file belongs to exactly one project. New tests use `dom` by default;
add them to `nodeTestFiles` only after verifying they need no DOM/browser mocks.

## Fast local iteration

```sh
npm run test:run -- --project=unit
npm run test:run -- src/__tests__/components/command/CommandPalette.test.tsx
npm run test:run -- --silent=false --reporter=verbose
npm run test:run -- --sequence.shuffle.files --sequence.seed=42
```

The times reported for transform, setup, import, tests and environment are summed
across concurrent workers. They do not add up to wall-clock duration. Compare the
`Duration` line on the same machine without concurrent test/build jobs, and repeat
runs to account for cache and system-load effects.

VM workers were evaluated but rejected: React/router module caching produced
order-dependent invalid-hook-call failures. Do not switch to VM pools or disable
isolation based on a single successful timing run.

## Async behavior and diagnostics

- Await asynchronous renders with `act` when mount effects schedule updates;
  await `userEvent` interactions and observable results before ending a test.
- Unmount subscribed components before resetting their stores in teardown.
- Reset mock call history and queued mock responses when tests require a clean
  cache/request state; clearing a storage map alone does not clear its spies.
- Negative-path tests may capture their expected console error locally, assert
  its exact arguments/count, and restore the spy in `finally`. Do not globally
  suppress React warnings or stderr to make a run look clean.

## Measured result

For 94 files / 694 tests on the same 18-logical-CPU machine:

| Run | Wall time |
| --- | ---: |
| Original configuration | 24.35 s |
| Isolated threads + 12 Node-only files | 17.33 s |
| Same configuration, shuffled files (seed 42) | 18.51 s |

The normal run improved by about 29%. Both final full runs completed without
stderr diagnostics. These are local measurements, not a CI performance threshold.

## Keep UI imports narrow

Import UI primitives from their own files in both application code and tests:

```ts
import { AppDialog, AppDialogTitle } from '../ui/AppDialog';
import { Skeleton } from '../ui/Skeleton';
```

The `components/ui/index.ts` compatibility barrel re-exports every primitive.
Loading it during a test also loads unrelated drawers, dialogs and their Vaul,
Headless UI and animation dependencies, even for a badge or skeleton. Production
bundler tree-shaking does not make those test-time imports free.

Mock the same leaf path used by the component, such as
`vi.mock('../../components/ui/AppPopover', ...)`. When replacing that module's
only export, return the mock directly; do not call `importOriginal` on the entire
UI barrel just to spread exports that the test does not use.

After replacing 43 UI-barrel imports and two broad mocks, a local before/after
comparison gave:

| Scope | Before | After |
| --- | ---: | ---: |
| Full suite wall time | 17.28 s | 16.86 s |
| Full suite summed import time | 37.70 s | 32.71 s |
| AppBadge + Skeleton + PhotoCard wall time | 1.89 s | 1.45 s |
| Those three files' summed import time | 1.66 s | 0.365 s |

The focused comparison used `--maxWorkers=1`; both full runs passed all 694 tests
without stderr output. The full-suite wall-time difference is small and subject
to normal run-to-run noise; the import reduction is most useful for focused tests.
