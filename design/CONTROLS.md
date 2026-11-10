> Original design reference from 2026-10-30. This describes intended behavior, not current implementation or qualification. The current app README is authoritative for status. Pseudocode and template JSON here are documentation, not build entries.

# Controls — Drone Circuit

All columns produce the same game intents. These mappings are design targets, not tested input bindings.

| Command | Desktop | Phone | Headset |
|---|---|---|---|
| `fly` | WASD, rise/fall keys, mouse yaw optional | Two thumb controls with explicit rise/fall buttons | Controller stick or world-panel pads; target-ray selection for menus |
| `reset-drone` | R | Reset button | Trackside Reset control |
| `change-view` | Camera button | Camera button | Choose fixed spectator pedestal; no forced chase |
| `pause-resume` | Escape / Pause or Resume button | Visible Pause / Resume | In-world Pause / Resume |
| `settings` | Settings panel | Scrollable settings sheet | In-world panel; file pickers may require exit |
| `load-save` | Load / Save document actions | Load / Save actions | Authorized slot save; explicit exit for system picker |
| `restart` | Restart after confirmation | Restart after confirmation | In-world Restart with confirmation |

## Input arbitration

A UI gesture is consumed once. Menu/Rive controls do not also fire into the game underneath. Pointer ids own their gestures; cancel/up/blur clears held state. Do not capture arrows/Space while another app or text field is focused. A touchscreen needs no hover or right-click. Keyboard menus retain visible focus.

Responsive layout follows this window's size; phone portrait and landscape must both remain playable, with contextual controls outside the important play area. Hardware gamepads are optional. The headset's native target-ray/select path is the baseline for immersive controls; articulated hands are an enhancement where this app specifies them.

See [phone/input guidance](../../../../../docs/games/design-reference/PHONE-AND-INPUT.md) and [common gates](../../../../../docs/games/design-reference/ACCEPTANCE-COMMON.md).
