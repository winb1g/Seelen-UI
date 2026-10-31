# winb1g/Seelen-UI — Fork Notes

Personal fork of [eythaann/Seelen-UI](https://github.com/eythaann/Seelen-UI) with bug fixes and small enhancements. The
overriding goal is that **upstream can be merged at any time with no (or trivial) conflicts**.

## Rules

1. **All fork code lives in [`fork/`](fork/)**, mirroring the upstream area it extends (`fork/weg/` for the dock,
   `fork/toolbar/` for the toolbar, etc.). Upstream has no such folder, so it can never conflict.
2. **Upstream files only get hooks**: the smallest possible change (ideally an import plus one line) that calls into
   `fork/`. Every hook is listed in the table below.
3. **Never edit upstream-owned shared files** such as translation files (`i18n/translations/*.yml`), generated code
   (`libs/core/src/handlers/commands.ts`, `gen/`) or lockfiles, unless a fix truly requires it. Fork UI strings live
   inside the fork module.
4. **Prefer extension points** that need no hook at all (themes, plugins, widgets) when they can do the job.
5. **Bug fixes that upstream would want** may be sent upstream as PRs. Once merged there, drop them from the fork.

## Workflow

- Branch per change from `master` (`feat/...`, `fix/...`) and open a PR into `winb1g/Seelen-UI:master`.
- Pull upstream into `master` regularly:

  ```bash
  git fetch upstream
  git merge upstream/master
  ```

- After a merge, check that every hook below still exists and still points at the right place.

## Hooks into upstream files

| Upstream file                                                   | Hook                                                       | Feature                         |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `src/background/main.rs`                                        | `#[path = "../../fork/background/mod.rs"] mod fork;`       | [Backend entry](#backend-entry) |
| `src/background/main.rs`                                        | `fork::init();` at the end of `setup`                      | [Backend entry](#backend-entry) |
| `src/ui/svelte/weg/components/items/UserApplicationItem.svelte` | import + `{@attach appVolumeControls(...)}` on `.weg-item` | [App volume](#app-volume)       |

## Features

### Backend entry

[`fork/background/mod.rs`](fork/background/mod.rs) — the fork's Rust module, compiled as part of the main binary.
`init()` starts every fork backend service; new ones are registered there, never in upstream files.

### Dock wheel bridge

[`fork/background/wheel_bridge.rs`](fork/background/wheel_bridge.rs) +
[`fork/weg/wheelBridge.ts`](fork/weg/wheelBridge.ts) — Windows only sends the mouse wheel to the hovered window when
_Scroll inactive windows when hovering over them_ is on, and the dock is never the focused window. A low-level mouse
hook catches the wheel over the dock (swallowing it, so the focused app doesn't scroll too) and forwards it to the dock
webview, which replays it as a normal DOM `wheel` event. Works with that Windows setting on or off. Transparent dock
areas are click-through, so the wheel over them still reaches the apps behind.

### App volume

[`fork/weg/appVolume.svelte.ts`](fork/weg/appVolume.svelte.ts) — on dock app items:

- **Scroll** changes the app volume in 5% steps.
- **Ctrl+click** mutes / unmutes the app (the normal click action is skipped).
- The **tooltip** shows `Volume: N%`, `Muted` or `No audio session` while doing so, until the pointer leaves.
