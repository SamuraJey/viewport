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
