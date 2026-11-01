# Acceptance — Drone Circuit

**All runtime cases are NOT RUN.** This file is a plan; document checks are not gameplay evidence.

Apply all C01–C24 in [common acceptance](../../docs/ACCEPTANCE-COMMON.md). Also apply X01–X16 on the actual Galaxy XR.

## Game-specific cases

| ID | Experiment / invariant | Status |
|---|---|---|
| drone-circuit-G01 | Passing behind/out of order cannot score a gate. | not_run |
| drone-circuit-G02 | Reset applies one penalty. | not_run |
| drone-circuit-G03 | Phone simultaneous controls retain pointer ownership. | not_run |
| drone-circuit-G04 | Ghost samples use simulation ticks. | not_run |
| drone-circuit-G05 | XR entry preserves drone velocity but starts paused until Resume. | not_run |
| drone-circuit-G06 | Large frame stall clamps catch-up and reports pause rather than teleporting through course. | not_run |

## Release evidence

Record rules/content and dependency versions, actual asset names/hashes, desktop browser, real phone and (where required) Galaxy XR build, commands/logs, complete-playthrough result, save restoration result, multiwindow/late-disposal behavior, frame timing and unresolved defects. Exercise actual Rive properties and texture input rather than substituting an HTML mock.

A pure rules unit test, a visual smoke test and a hardware XR test are different evidence. Preserve that distinction. All promised features must be demonstrated or explicitly left incomplete; do not relabel a generic engine scene as the finished game.
