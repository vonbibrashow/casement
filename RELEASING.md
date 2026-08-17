# Releasing

Casement bundles Chromium, so a release is how users receive browser security
fixes. Treat a stale release as a liability, not a neutral state.

## One-time setup

1. Create a **public** GitHub repo named `casement` under your account.
   Public matters: GitHub Releases and Actions are free for public repos, and
   the updater reads releases anonymously.
2. Confirm `publish.owner` / `publish.repo` in `electron-builder.yml` match it.
3. Push: `git remote add origin <url> && git push -u origin main`

No secrets are required. Signing is skipped automatically when the certificate
secrets are absent.

## Cutting a release

```bash
npm version minor          # bumps package.json and creates a v* tag
git push --follow-tags
```

The tag triggers `.github/workflows/release.yml`, which typechecks, builds,
regenerates the icon and licence manifest, packages the Windows installer and
portable exe, and publishes them to a GitHub Release. Installed copies pick the
update up within six hours, or immediately via **Check now** in the About
screen.

To build locally instead: `npm run dist:win` (artifacts land in `release/`).

## Before you publish the first one

- [ ] Decide the licence. `LICENSE` is currently a conservative placeholder —
      free to use, rights reserved — chosen because rights can be given away
      later but never reclaimed. Swap it for MIT if you want this open, or get
      proper terms reviewed if you intend to sell it.
- [ ] Check the version in **About** matches the tag.
- [ ] Verify the installer runs on a machine that has never had Casement on it.
- [ ] Say plainly in the release notes that the build is unsigned and Windows
      will warn.

## Checklist for every release

- [ ] `npm run typecheck` clean
- [ ] Launch the packaged build, not just the dev build
- [ ] Share a panel to a phone and confirm approve → control still works
- [ ] Quit and relaunch: workspaces, tabs and logins survive
- [ ] Note anything users must do by hand (e.g. profile migrations)

## When there's budget

A Windows OV/EV certificate removes the SmartScreen warning (EV immediately;
OV builds reputation over time). Add `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`
as repository secrets and the existing workflow signs automatically — no code
changes. An Apple Developer account ($99/yr) unlocks the commented-out macOS
job in the same workflow.

## If a release ends up duplicated

electron-builder can race while uploading several artifacts and create two
release records for the same tag — GitHub then serves one of them as "latest",
and if that's the one without `latest.yml`, updates silently stop working.

The workflow now creates the release before building to avoid this. If it ever
recurs, check with:

```bash
gh api repos/<owner>/casement/releases -q '.[] | "id=\(.id) tag=\(.tag_name) assets=\(.assets|length)"'
```

Move any stray assets onto the release holding the installers, delete the empty
duplicate, then confirm the feed is publicly readable:

```bash
curl -sL https://github.com/<owner>/casement/releases/latest/download/latest.yml
```
