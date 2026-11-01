# Drone Circuit — desktop integration

Drone Circuit is a Babylon.js 3D time-trial preview using the completed
deterministic flight model. Three courses contain ordered gates and simple
collision obstacles. Forward/back, strafe and altitude inputs drive one
fixed-step model; gates score only in sequence and in the forward direction.

Each window owns its Babylon engine, scene, keyboard/pointer listeners, audio
context and file subscription. The app pauses on focus loss, supports a stable
trackside camera and an optional chase camera, and disposes idempotently.

Save and Open use the signed-in desktop's My files context. Flight pose,
velocity, ticks, penalties, best-run ghost samples and RNG state are validated
before replacing the live flight. Loading and file-route launches restore
paused; changed or conflicting saved files remain visible without replacing
the current flight.

## Verification

```sh
npm ci --prefix apps/system/drone-circuit --ignore-scripts
npm run typecheck --prefix apps/system/drone-circuit
npm test --prefix apps/system/drone-circuit
node tests/drone-circuit-browser.test.mjs
CODI_PHONE=1 node tests/drone-circuit-browser.test.mjs
node tests/drone-circuit-account.test.mjs
```

## Remaining gates

- No authored `drone-telemetry.riv` is supplied. The telemetry card is a
  clearly labeled development fallback.
- The entered-XR flow, trackside pedestal controls, world-space Rive panel and
  Galaxy XR hardware evidence remain unimplemented or unrun.
- Physical-phone testing, a full three-course medal run and performance/thermal
  evidence remain open.

Engine version is pinned in `package-lock.json`: `@babylonjs/core` 9.33.1.

The isolated `tests/drone-circuit-controls-review.test.mjs` checks overlapping
emulated touches, release of keyboard throttle on focus loss, and account
save/sync/reopen at desktop and phone sizes. Physical touch and complete course
playthroughs remain untested.
