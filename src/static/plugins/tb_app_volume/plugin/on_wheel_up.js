const STEP = 0.05;
const normalize = (path) => (path ? String(path).replaceAll("/", "\\").toLowerCase() : null);
const exe = normalize(focusedApp && focusedApp.exe);
const sessions = exe && defaultOutputDevice
  ? defaultOutputDevice.sessions.filter((s) => !s.isSystem && normalize(s.iconPath) === exe)
  : [];

if (!sessions.length) {
  return;
}

const current = Math.max(...sessions.map((s) => s.volume));
const level = Math.min(1, Math.round((current + STEP) * 100) / 100);
for (const session of sessions) {
  invoke(SeelenCommand.SetVolumeLevel, { deviceId: defaultOutputDevice.id, sessionId: session.id, level });
}
