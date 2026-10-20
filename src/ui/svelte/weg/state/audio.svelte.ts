import { invoke, SeelenCommand, SeelenEvent, subscribe } from "@seelen-ui/lib";
import type { MediaDevice, MediaDeviceSession, UserAppWindow } from "@seelen-ui/lib/types";
import { lazyRune } from "libs/ui/svelte/utils";

/** Volume change (0..1) applied for each wheel notch. */
const VOLUME_STEP = 0.1;
/** Wheel events closer than this (ms) are based on the last requested level, not the (async) device state. */
const OPTIMISTIC_WINDOW_MS = 400;

export interface AppAudio {
  deviceId: string;
  /** a single app can own several sessions (browsers, electron apps, etc.) */
  sessions: MediaDeviceSession[];
  /** 0..1 */
  volume: number;
  muted: boolean;
}

// `[inputs, outputs]`. Backend errors (e.g. no audio device) must not break the dock.
const mediaDevices = lazyRune(() =>
  invoke(SeelenCommand.GetMediaDevices).catch((): [MediaDevice[], MediaDevice[]] => [[], []])
);
subscribe(SeelenEvent.MediaDevices, mediaDevices.setByPayload);
await mediaDevices.init();

function normalizePath(path?: string | null): string | null {
  return path ? path.replaceAll("/", "\\").toLowerCase() : null;
}

/**
 * Finds the audio sessions (on the default output device) owned by the given windows.
 *
 * A session belongs to a window when it comes from the same process, or from a process running the same executable.
 * The latter is needed because browsers and electron apps play audio from a child process (audio service), not from
 * the process that owns the window.
 */
export function getAppAudio(windows: UserAppWindow[]): AppAudio | null {
  if (!windows.length) return null;

  const device = mediaDevices.value[1].find((d) => d.isDefaultMultimedia);
  if (!device) return null;

  const pids = new Set(windows.map((w) => w.process.id));
  const paths = new Set(windows.map((w) => normalizePath(w.process.path)).filter((p) => p !== null));

  const sessions = device.sessions.filter((s) => {
    if (s.isSystem) return false;
    const path = normalizePath(s.iconPath);
    return pids.has(s.processId) || (path !== null && paths.has(path));
  });
  if (!sessions.length) return null;

  return {
    deviceId: device.id,
    sessions,
    volume: Math.max(...sessions.map((s) => s.volume)),
    muted: sessions.every((s) => s.muted),
  };
}

let lastRequest: { key: string; level: number; at: number } | null = null;

/** @param steps positive raises the volume, negative lowers it. One step = one wheel notch. */
export async function stepAppVolume(audio: AppAudio, steps: number): Promise<void> {
  const key = audio.sessions.map((s) => s.id).join("|");
  const base = lastRequest?.key === key && Date.now() - lastRequest.at < OPTIMISTIC_WINDOW_MS
    ? lastRequest.level
    : audio.volume;
  const level = Math.round(Math.min(1, Math.max(0, base + steps * VOLUME_STEP)) * 100) / 100;
  lastRequest = { key, level, at: Date.now() };

  try {
    await Promise.all(
      audio.sessions.map((s) =>
        invoke(SeelenCommand.SetVolumeLevel, { deviceId: audio.deviceId, sessionId: s.id, level })
      ),
    );

    // Same as the Windows mixer: reaching zero mutes the app, any increase unmutes it.
    const shouldMute = level === 0;
    await Promise.all(
      audio.sessions
        .filter((s) => s.muted !== shouldMute && (shouldMute || steps > 0))
        .map((s) => invoke(SeelenCommand.MediaToggleMute, { deviceId: audio.deviceId, sessionId: s.id })),
    );
  } catch (e) {
    console.error("Failed to change app volume", e);
  }
}

export async function toggleAppMute(audio: AppAudio): Promise<void> {
  const shouldMute = !audio.muted;
  try {
    await Promise.all(
      audio.sessions
        .filter((s) => s.muted !== shouldMute)
        .map((s) => invoke(SeelenCommand.MediaToggleMute, { deviceId: audio.deviceId, sessionId: s.id })),
    );
  } catch (e) {
    console.error("Failed to toggle app mute", e);
  }
}
