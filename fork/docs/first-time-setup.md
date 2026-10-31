# First-time setup runbook (for a local AI agent)

Instructions for **Claude Code running on the owner's Windows PC**, to do the one-time setup of releases, updates and
upstream sync for this fork, from a fresh machine to the fork installed and self-updating. Background:
[releasing.md](releasing.md), [updating.md](updating.md), [ci.md](ci.md).

The owner is not familiar with git, GitHub or the command line. Do everything you can yourself, explain each step in one
plain sentence before doing it, and only hand over what needs a human (marked **👤 OWNER**). When you hand over, give
exact clicks / text to type, one action at a time, and wait for confirmation.

## Ground rules

- **Secrets never enter this conversation.** Never print, `cat`, `type`, `Get-Content`, read or echo the private key,
  its password or any token, and never pass one as a literal in a command. Pipe files straight into `gh secret set`.
  Only the public key (`*.key.pub`) may be read.
- **Ask before** anything outward-facing or hard to undo: installing software, renaming the repo, merging a PR, running
  an installer.
- Repo: `winb1g/Seelen-UI` until step 3, `winb1g/Seelen-UI-tweaks` after. Upstream: `eythaann/Seelen-UI` (read only:
  never push, open PRs or comment there).
- Setup branch: `claude/gracious-einstein-5xv7zm`. Don't touch other branches or PRs.
- Commands are written for Git Bash (Claude Code's shell on Windows). `~` is `C:\Users\<owner>`.
- If a step fails, read the error, fix what's yours to fix, and explain anything that needs the owner. Don't skip steps.
- Keep the checklist at the end up to date and show it at the end.

## 1. Tools

Check: `git --version`, `gh --version`, `node --version` (needs **22.18 or newer**).

If any is missing or too old, ask the owner, then install with winget and restart the check (a new terminal may be
needed for PATH):

```bash
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id OpenJS.NodeJS.LTS -e
```

## 2. GitHub login and the repo

`gh auth status`. If not logged in, or the token lacks the `workflow` scope:

> **👤 OWNER**: open a separate PowerShell window and run `gh auth login --web --scopes workflow`. Choose
> **GitHub.com**, **HTTPS**, **Yes** to authenticate git, then copy the one-time code, press Enter, paste the code in
> the browser and approve. Tell me when it says "Logged in".

Then `gh auth setup-git`.

Get the repo into `~/dev/Seelen-UI-tweaks` (reuse an existing clone of `winb1g/Seelen-UI` if the owner has one):

```bash
mkdir -p ~/dev && cd ~/dev
git clone https://github.com/winb1g/Seelen-UI.git Seelen-UI-tweaks
cd Seelen-UI-tweaks
git remote add upstream https://github.com/eythaann/Seelen-UI.git   # skip if it exists
git fetch origin claude/gracious-einstein-5xv7zm
git switch claude/gracious-einstein-5xv7zm
```

Then read `FORK.md`, `fork/docs/releasing.md` and `fork/docs/ci.md` before going on.

## 3. Rename the repo

Ask the owner to confirm renaming `winb1g/Seelen-UI` to `winb1g/Seelen-UI-tweaks`, then:

```bash
gh repo rename Seelen-UI-tweaks -R winb1g/Seelen-UI --yes
git remote set-url origin https://github.com/winb1g/Seelen-UI-tweaks.git
gh repo edit winb1g/Seelen-UI-tweaks \
  --description "Unofficial fork of eythaann/Seelen-UI: small fixes & QoL tweaks, tracks upstream" \
  --add-topic seelen-ui --add-topic windows --add-topic desktop-environment --add-topic fork
git remote -v   # origin must show Seelen-UI-tweaks
```

From here on use `-R winb1g/Seelen-UI-tweaks`.

## 4. Disable upstream workflows

They need upstream's secrets and fail on every merge (see FORK.md > Upstream workflows). Keep `ci.yml` **enabled**.

```bash
for wf in nightly.yml release.yml release_no_signed.yml msix.yml publish-core.yml discord-notify.yml dependabot-automerge.yml; do
  gh workflow disable "$wf" -R winb1g/Seelen-UI-tweaks || echo "could not disable $wf"
done
gh workflow list --all -R winb1g/Seelen-UI-tweaks
```

Expected: those seven `disabled_manually`; `Continuous Integration` (`ci.yml`) active. A workflow that GitHub doesn't
list yet has never run: that's fine, re-check after the first merge.

## 5. Signing key pair and secrets

One long-lived key pair signs every release; installed copies only accept updates signed by it. Generate it without the
password or private key ever appearing on screen:

```bash
mkdir -p ~/.tauri
test -e ~/.tauri/seelen-ui-tweaks.key && echo "KEY ALREADY EXISTS: stop and ask the owner"   # never overwrite a key
node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))" > ~/.tauri/seelen-ui-tweaks.password
npx --yes @tauri-apps/cli@2 signer generate --ci \
  -w ~/.tauri/seelen-ui-tweaks.key \
  -p "$(cat ~/.tauri/seelen-ui-tweaks.password)" > /dev/null 2>&1
echo "exit $?"; ls ~/.tauri   # expect: seelen-ui-tweaks.key, seelen-ui-tweaks.key.pub, seelen-ui-tweaks.password
```

Store both as repository secrets, straight from the files:

```bash
tr -d '\r\n' < ~/.tauri/seelen-ui-tweaks.key      | gh secret set TAURI_SIGNING_PRIVATE_KEY          -R winb1g/Seelen-UI-tweaks
tr -d '\r\n' < ~/.tauri/seelen-ui-tweaks.password | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R winb1g/Seelen-UI-tweaks
gh secret list -R winb1g/Seelen-UI-tweaks
```

> **👤 OWNER — backup (important)**: copy the folder `C:\Users\<you>\.tauri` somewhere safe (password manager
> attachment, USB stick, private cloud folder). If it's lost, installed copies can't update anymore and need a manual
> reinstall. Never share these files.

## 6. Commit the public key

Put the contents of `~/.tauri/seelen-ui-tweaks.key.pub` (public, safe to read) into `SIGN_PUB_KEY` in
`fork/background/release.rs`, on one line like upstream's key: `pub const SIGN_PUB_KEY: &str = "<key>";`. Then:

```bash
node fork/scripts/fork-check.ts preflight winb1g/Seelen-UI-tweaks   # must print two ✓ lines
node fork/scripts/fork-check.ts hooks
node --test "fork/**/*.test.ts"
git add fork/background/release.rs
git commit -m "feat(fork): add release signing public key"
git push origin claude/gracious-einstein-5xv7zm
```

If `cargo` is installed, run `cargo fmt -- --check` first and fix what it reports. If the commit hook fails for missing
tools (lefthook, deno, cargo), retry with `git commit --no-verify`: CI runs the same checks.

## 7. Sync token

`fork-sync.yml` (monthly upstream merge) needs a token GitHub can't create from the command line.

> **👤 OWNER**:
>
> 1. Open <https://github.com/settings/personal-access-tokens/new>.
> 2. **Token name**: `Seelen-UI-tweaks sync`. **Expiration**: the longest offered (put a calendar reminder to renew).
> 3. **Repository access**: _Only select repositories_ → `winb1g/Seelen-UI-tweaks`.
> 4. **Permissions → Repository permissions**: set **Contents**, **Pull requests** and **Workflows** to **Read and
>    write**.
> 5. **Generate token**. Don't paste it here. In a separate PowerShell window run
>    `gh secret set FORK_SYNC_TOKEN -R winb1g/Seelen-UI-tweaks`, paste the token when asked, press Enter. Tell me when
>    done.

Verify with `gh secret list -R winb1g/Seelen-UI-tweaks`: three secrets.

## 8. Pull request and merge

```bash
gh pr create -R winb1g/Seelen-UI-tweaks --base master --head claude/gracious-einstein-5xv7zm \
  --title "feat(fork): self-hosted releases, in-app updates and fork CI" \
  --body "Releases, in-app updates from this fork, fork CI and monthly upstream sync. See fork/docs/."
gh pr checks claude/gracious-einstein-5xv7zm --watch -R winb1g/Seelen-UI-tweaks   # Upstream CI (~5–15 min) + Fork CI
```

If a check fails: `gh run view <run-id> --log-failed -R winb1g/Seelen-UI-tweaks`, fix on the same branch following
FORK.md, push, watch again. When all checks are green, ask the owner, then merge **with a merge commit**:

```bash
gh pr merge claude/gracious-einstein-5xv7zm --merge -R winb1g/Seelen-UI-tweaks
```

## 9. First release

The merge starts **Fork Release** (about 30–50 min: checks, Windows build, publish). Tell the owner it's running, then:

```bash
gh run list --workflow fork-release.yml -R winb1g/Seelen-UI-tweaks --limit 1
gh run watch <run-id> -R winb1g/Seelen-UI-tweaks
```

On failure: `--log-failed`, see the troubleshooting table in [releasing.md](releasing.md), fix through a new `fix/...`
branch + PR (never push to `master` directly), and the next merge releases again. Once green:
`gh release view -R winb1g/Seelen-UI-tweaks` must show the `.exe`, `.exe.sig` and `latest.json`.

## 10. Install

Ask before each action.

1. If Seelen UI came from the Microsoft Store it must be removed first. In PowerShell:
   `Get-AppxPackage *seelen* | Select Name, Version`. If anything is listed, the owner uninstalls it (Start → Settings →
   Apps → Installed apps → Seelen UI → Uninstall).
2. Download: `gh release download -R winb1g/Seelen-UI-tweaks --pattern "*-setup.exe" --dir ~/Downloads --clobber`.
3. **👤 OWNER**: run the installer from Downloads. Windows shows _Windows protected your PC_ (the build isn't
   > code-signed): click **More info → Run anyway**, then go through the installer. It replaces an official install and
   > keeps your settings.
4. The owner opens Seelen UI **Settings**: the version must end in `-fork.<numbers>`.

## 11. Wrap up

Re-run `gh workflow list --all -R winb1g/Seelen-UI-tweaks` and disable any upstream workflow (not `fork-*`, not
`ci.yml`) that showed up active. Then show the owner this checklist, filled in, plus how updates work from now on:
_change → PR → merge → wait for Fork Release → Settings → download icon_.

- [ ] Tools ready, `gh` logged in with `workflow` scope
- [ ] Repo renamed to `Seelen-UI-tweaks`, local `origin` updated, `upstream` remote added
- [ ] Upstream workflows disabled, `ci.yml` active
- [ ] Key pair generated, 2 signing secrets set, owner backed up `~/.tauri`
- [ ] Public key committed, preflight passes
- [ ] `FORK_SYNC_TOKEN` secret set
- [ ] Setup PR green and merged (merge commit)
- [ ] First Fork Release published with installer, `.sig`, `latest.json`
- [ ] Fork installed, version ends in `-fork.<numbers>`
