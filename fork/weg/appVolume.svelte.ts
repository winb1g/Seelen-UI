/**
 * [fork] Per-app volume control on dock items.
 *
 * - Scroll over an item to change the volume of that app.
 * - Ctrl+click an item to mute / unmute it.
 * - While doing so the item tooltip shows the app volume, until the pointer leaves.
 *
 * Hooked into upstream via a single `{@attach}` in `UserApplicationItem.svelte` (see FORK.md).
 */
import { invoke, SeelenCommand, SeelenEvent, subscribe } from "@seelen-ui/lib";
import type { MediaDeviceSession, UserAppWindow } from "@seelen-ui/lib/types";
import type { Attachment } from "svelte/attachments";
import { lazyRune } from "libs/ui/svelte/utils";
import type { AppOrFileWegItem } from "src/ui/svelte/weg/types.ts";
import "./wheelBridge.ts";

const VOLUME_STEP = 0.05;
// a mouse wheel notch is ~100, touchpads send many small deltas that are accumulated
const WHEEL_STEP_DELTA = 50;
// how long a requested change is trusted over the system value, until the system reports it back
const PENDING_TTL_MS = 1000;

const STRINGS = {
  level: (percent: number) => `Volume: ${percent}%`,
  muted: "Muted",
  noSession: "No audio session",
};

const outputs = lazyRune(async () => (await invoke(SeelenCommand.GetMediaDevices))[1]);
subscribe(SeelenEvent.MediaOutputs, outputs.setByPayload);
await outputs.init();

interface AppAudioSession {
  deviceId: string;
  session: MediaDeviceSession;
}

/**
 * Attaches the volume controls to a dock item element.
 * Getters are used so the attachment is created once and always reads the latest item state.
 */
export function appVolumeControls(
  getItem: () => AppOrFileWegItem,
  getWindows: () => UserAppWindow[],
): Attachment<HTMLElement> {
  return (el) => {
    const sessions = $derived(getAudioSessionsForItem(getItem(), getWindows()));

    let active = $state(false);
    let pendingLevel = $state<number | null>(null);
    let pendingMuted = $state<boolean | null>(null);
    let pendingTimeout: ReturnType<typeof setTimeout> | undefined;
    let wheelDelta = 0;
    let upstreamTooltip: string | undefined;

    function keepPending() {
      clearTimeout(pendingTimeout);
      pendingTimeout = setTimeout(() => {
        pendingLevel = null;
        pendingMuted = null;
      }, PENDING_TTL_MS);
    }

    $effect(() => {
      if (!active) return;
      const session = sessions[0]?.session;
      upstreamTooltip ??= el.dataset.tooltip;
      if (!session) {
        el.dataset.tooltip = STRINGS.noSession;
      } else if (pendingMuted ?? session.muted) {
        el.dataset.tooltip = STRINGS.muted;
      } else {
        el.dataset.tooltip = STRINGS.level(Math.round((pendingLevel ?? session.volume) * 100));
      }
    });

    function deactivate() {
      active = false;
      wheelDelta = 0;
      if (upstreamTooltip !== undefined) {
        el.dataset.tooltip = upstreamTooltip;
        upstreamTooltip = undefined;
      }
    }

    function onWheel(e: WheelEvent) {
      active = true;
      if (!sessions.length) return;

      wheelDelta += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * WHEEL_STEP_DELTA;
      if (Math.abs(wheelDelta) < WHEEL_STEP_DELTA) return;
      const direction = wheelDelta < 0 ? 1 : -1;
      wheelDelta = 0;

      const current = pendingLevel ?? sessions[0]!.session.volume;
      pendingLevel = setAppVolume(sessions, current + direction * VOLUME_STEP);
      keepPending();
    }

    // captured and stopped so the upstream click (focus / launch) doesn't run on ctrl+click
    function onClick(e: MouseEvent) {
      if (!e.ctrlKey) return;
      e.stopPropagation();
      e.preventDefault();
      active = true;
      if (!sessions.length) return;

      pendingMuted = toggleAppMute(sessions, pendingMuted ?? sessions[0]!.session.muted);
      keepPending();
    }

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("click", onClick, { capture: true });
    el.addEventListener("pointerleave", deactivate);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("click", onClick, { capture: true });
      el.removeEventListener("pointerleave", deactivate);
      clearTimeout(pendingTimeout);
      deactivate();
    };
  };
}

/**
 * Audio sessions belonging to a dock item, sessions on the default output device first.
 * Matching is done by executable path (apps like browsers play audio from a child process
 * other than the one owning the window) and by the process id of the item's windows.
 */
function getAudioSessionsForItem(item: AppOrFileWegItem, windows: UserAppWindow[]): AppAudioSession[] {
  const paths = new Set(
    [item.path, item.relaunch?.command, ...windows.map((w) => w.process.path)]
      .filter((p): p is string => !!p)
      .map((p) => p.toLowerCase()),
  );
  const pids = new Set(windows.map((w) => w.process.id));

  const devices = outputs.value.toSorted((a, b) => Number(b.isDefaultMultimedia) - Number(a.isDefaultMultimedia));

  const result: AppAudioSession[] = [];
  for (const device of devices) {
    for (const session of device.sessions) {
      if (session.isSystem) continue;
      const sessionPath = session.iconPath?.toLowerCase();
      if (pids.has(session.processId) || (sessionPath && paths.has(sessionPath))) {
        result.push({ deviceId: device.id, session });
      }
    }
  }
  return result;
}

/** Sets all the sessions to the same level, returns the applied level */
function setAppVolume(sessions: AppAudioSession[], level: number): number {
  const clamped = Math.min(1, Math.max(0, Math.round(level * 100) / 100));
  for (const { deviceId, session } of sessions) {
    invoke(SeelenCommand.SetVolumeLevel, { deviceId, sessionId: session.id, level: clamped }).catch(
      console.error,
    );
  }
  return clamped;
}

/** Brings all the sessions to the opposite of `currentlyMuted`, returns the new muted state */
function toggleAppMute(sessions: AppAudioSession[], currentlyMuted: boolean): boolean {
  const mute = !currentlyMuted;
  for (const { deviceId, session } of sessions) {
    if (session.muted === mute) continue;
    invoke(SeelenCommand.MediaToggleMute, { deviceId, sessionId: session.id }).catch(console.error);
  }
  return mute;
}
