# Releasing the fork

Every merge into `master` builds and publishes a release with
[`fork-release.yml`](../../.github/workflows/fork-release.yml). Installed copies update to it from the app (see
[updating.md](updating.md)). Docs-only and `.github/` changes don't release; run the workflow by hand (Actions → Fork
Release → Run workflow) when needed.

## How it works

| Step        | What happens                                                                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight   | `fork-check.ts preflight`: public key set, update endpoint points at this repo, signing secret present. Fails in seconds instead of after the build.                                                                       |
| Checks      | Upstream's `ci.yml` + `fork-ci.yml` (see [ci.md](ci.md)).                                                                                                                                                                  |
| Version     | `<package.json version>-fork.<UTC yymmddHHMM>`, e.g. `2.8.11-fork.2610311530`. Set in CI only with upstream's `scripts/versionish.ts ci`, so `package.json` is never committed. Always increasing, so the updater sees it. |
| Build       | Windows x64 NSIS installer (`tauri build --no-bundle`, then `tauri bundle --no-sign` as upstream does), signed with the fork key: updater signature (`.sig`) and `SHA256SUMS.sig` of the bundled files.                    |
| Publish     | `fork-check.ts key-match` refuses a signature that installed copies couldn't verify. Then a GitHub release `v<version>` with the installer, `.sig` and `latest.json` (upstream's `generate-update-manifest` action).       |
| Mark latest | Last step, so the updater only ever sees complete releases.                                                                                                                                                                |

Not built (upstream only): ARM64, the fixed-WebView2-runtime installer, MSIX / Microsoft Store, SignPath code signing,
npm and Discord publishing.

## One-time setup

A local AI agent can do all of this (plus the repo rename and first install) by following
[first-time-setup.md](first-time-setup.md). By hand:

### 1. Signing key pair

The fork has **one long-lived key pair**. Installed copies only accept updates signed by the key whose public half they
were built with: losing the private key means reinstalling by hand, a new key per build means updates never verify.

On your own machine (never in a cloud session or chat):

```bash
npx tauri signer generate -w ~/.tauri/seelen-ui-tweaks.key
```

Set a password when prompted. It writes the private key (`seelen-ui-tweaks.key`) and the public key
(`seelen-ui-tweaks.key.pub`). **Back up the private key and its password** (e.g. password manager).

### 2. Repository secrets

GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:

| Secret                               | Value                                       |
| ------------------------------------ | ------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of `~/.tauri/seelen-ui-tweaks.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password                                |

### 3. Public key

Paste the contents of `~/.tauri/seelen-ui-tweaks.key.pub` into `SIGN_PUB_KEY` in
[`fork/background/release.rs`](../background/release.rs) and merge it. It's public, committing it is safe.

### 4. Upstream workflows

Disable the upstream workflows listed in [FORK.md > Upstream workflows](../../FORK.md#upstream-workflows) (Actions →
pick the workflow → `···` → Disable workflow). Keep `ci.yml` enabled.

## Local release builds

Release builds sign `SHA256SUMS` at compile time (`src/build.rs`), so `tauri build` needs the key in the environment:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$HOME\.tauri\seelen-ui-tweaks.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password>"
npx tauri build
```

Debug / `npm run tauri dev` builds need nothing: they skip the signature check and never self-update.

## Troubleshooting

| Symptom                                               | Cause / fix                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Preflight: `SIGN_PUB_KEY is empty`                    | Do setup step 3.                                                                                                |
| Preflight: `RELEASE_ENDPOINT ... doesn't point at...` | Repo renamed: update `RELEASE_ENDPOINT` in `release.rs`.                                                        |
| Publish: `signed with key X, but release.rs trusts Y` | Secret and public key are from different key pairs. Fix the secret (or the public key, then reinstall by hand). |
| Installed app: "bundle files integrity" error         | The build was signed with a key other than `SIGN_PUB_KEY` (e.g. a local build without the right key).           |
