# Installing and updating the fork

## First install

1. Download `Seelen.UI.Tweaks_<version>_x64-setup.exe` from the
   [latest release](https://github.com/winb1g/Seelen-UI-tweaks/releases/latest).
2. If Seelen UI came from the **Microsoft Store**, uninstall it first: Store installs never self-update.
3. Run the installer. The build isn't code-signed, so SmartScreen shows _Windows protected your PC_ the first time:
   **More info → Run anyway**.

The fork keeps upstream's app identity, so it **replaces** an official install in place and keeps your settings, themes
and widgets. The installed version reads `<upstream version>-fork.<timestamp>`.

## Updating

Open **Settings**: when a newer fork release exists, a download icon appears in the header. Click it, the update
downloads and the installer runs. Fork builds only ever update to fork releases: official upstream releases are never
offered.

## Day-to-day loop

```
change locally (npm run tauri dev)  →  branch + PR  →  Upstream CI + Fork CI green  →  merge
  →  Fork Release (~30–50 min)  →  Settings → download icon
```

Watch the build under **Actions → Fork Release**. Upstream changes arrive the same way: merging the monthly sync PR
publishes a release too.

## Going back to official Seelen UI

Install the official installer from [upstream releases](https://github.com/eythaann/Seelen-UI/releases) over it. If the
installer refuses because the fork version is newer, uninstall the fork first.
