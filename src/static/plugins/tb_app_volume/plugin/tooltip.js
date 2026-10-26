const normalize = (path) => (path ? String(path).replaceAll("/", "\\").toLowerCase() : null);
const exe = normalize(focusedApp && focusedApp.exe);
const sessions = exe && defaultOutputDevice
  ? defaultOutputDevice.sessions.filter((s) => !s.isSystem && normalize(s.iconPath) === exe)
  : [];

const name = (focusedApp && focusedApp.name) || "";
if (!sessions.length) {
  return name;
}

const level = Math.max(...sessions.map((s) => s.volume));
return name + ": " + (level * 100).toFixed(0) + "%";
