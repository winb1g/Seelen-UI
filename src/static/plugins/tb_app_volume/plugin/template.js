const normalize = (path) => (path ? String(path).replaceAll("/", "\\").toLowerCase() : null);
const exe = normalize(focusedApp && focusedApp.exe);
const sessions = exe && defaultOutputDevice
  ? defaultOutputDevice.sessions.filter((s) => !s.isSystem && normalize(s.iconPath) === exe)
  : [];

if (!sessions.length) {
  return [icon("IoVolumeOffOutline"), " ", "--"];
}

const level = Math.max(...sessions.map((s) => s.volume));
const percentage = (level * 100).toFixed(0) + "%";

if (sessions.every((s) => s.muted)) {
  return [icon("IoVolumeMuteOutline"), " ", percentage];
}

return [
  level >= 0.66
    ? icon("IoVolumeHighOutline")
    : level >= 0.33
    ? icon("IoVolumeMediumOutline")
    : level > 0
    ? icon("IoVolumeLowOutline")
    : icon("IoVolumeOffOutline"),
  " ",
  percentage,
];
