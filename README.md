# Drone Circuit

**Single-player 3D time trial · Babylon.js · single-player · phone required · immersive XR required**

> Planned design, not implemented or browser-tested. `index.pseudo.mjs` is an explanatory entry point, not a playable game.

## Experience

Pilot a tiny drone through ordered gates while viewing it from a stable trackside position or desktop chase camera.

## What this demonstrates

- 3D camera rigs and interpolated motion
- Gate geometry and replay
- Spatial audio and animated telemetry

## Rules and complete loop

- Bounded arcade flight controls; no aerodynamic claim. Gates must be crossed in sequence and correct direction.
- A reset returns to the last valid gate with a time penalty. Best-run ghost is non-colliding recorded presentation.
- XR baseline is trackside remote piloting; a camera strapped to the moving drone is not required.

## Bounded polished release

Three compact courses, training mode and bronze/silver/gold targets.

- Large distant gate silhouettes
- Ghost reduced opacity with opt-out
- Stable XR horizon and selectable spectator positions

No multiplayer, accounts, server simulation or generic editor is required. Start, rules/help, play/activity, pause, outcome/goal feedback and retry must all be complete. Settings include volume/mute, reduced motion, contrast and game-specific options where meaningful. State changes occur in the game model; animations illustrate them.

## Rive inside this app

Telemetry card and animated mechanic, as a spatial panel in XR. The requested asset is `drone-telemetry.riv`; it is **not included**. See [RIVE.md](RIVE.md) for the authoring/integration contract. A placeholder or unrelated animated logo does not satisfy this requirement.

## Save behavior

Exact logical flight state; loading resumes paused at saved pose. Persistent ghosts capped by duration/sample count. See [SAVE.md](SAVE.md). Loading starts paused; resume is explicit. Entering/exiting XR preserves the live current state even when exported saves are checkpoints.

## Build sequence

Implement the rule loop in [gameplay.pseudo.txt](gameplay.pseudo.txt); bind the exact app lifecycle from [index.pseudo.mjs](index.pseudo.mjs); complete [CONTROLS.md](CONTROLS.md); author/integrate [RIVE.md](RIVE.md); then satisfy [ACCEPTANCE.md](ACCEPTANCE.md). The full XR flow and game-specific presentation are in [XR.md](XR.md).

Target wave: **2**. Integrator first reads [AGENTS.md](../../AGENTS.md); do not guess host APIs from symbolic helper names.

Use original/licensed artwork and audio. Keep the scope small enough to polish; expand content only after the release gates pass.
