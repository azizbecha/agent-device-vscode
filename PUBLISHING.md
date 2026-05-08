# Publishing to the VS Code Marketplace

These steps assume the work that's already in this repo: the `package.json` `publisher`, `version`, `icon`, `keywords`, `repository`, `bugs`, `homepage`, `galleryBanner`, and `preview` fields are configured. The `LICENSE`, `README.md`, and `CHANGELOG.md` are present. CI is green on `main`.

## One-time setup

1. **Create a publisher**

   Visit <https://marketplace.visualstudio.com/manage> and sign in with the Microsoft account that should own the listing. Click "Create publisher" and pick an ID. Update `package.json` `publisher` to match.

   > Right now `package.json` has `"publisher": "azizbecha"`. That string must match a publisher you (or your org) actually own on the marketplace.

2. **Create a Personal Access Token (PAT)**

   Go to <https://dev.azure.com> → User settings → Personal access tokens → New token.
   - Organization: **All accessible organizations**
   - Scopes: **Custom defined** → **Marketplace** → **Manage**
   - Expiration: pick something you can rotate (90 days is the maximum)

   Copy the token. It is shown once.

3. **Log in `vsce` locally**

   ```bash
   npx vsce login <publisher>
   # paste the PAT when prompted
   ```

   The token is cached under `~/.vsce`. You won't need to re-paste it for subsequent publishes from the same machine.

## Automated release (preferred)

Tag-driven via GitHub Actions. Push a `v*.*.*` tag to `main` and the **Publish** workflow (`.github/workflows/publish.yml`) runs lint, format, tests, compile, package, publishes to the VS Code Marketplace and Open VSX, and creates a matching GitHub Release with the `.vsix` attached and the corresponding `CHANGELOG.md` section as the body.

### One-time secrets

In the repository settings → Secrets and variables → Actions, add:

- `VSCE_PAT` — Marketplace PAT (required, see one-time setup above)
- `OVSX_PAT` — Open VSX PAT (optional; if absent the Open VSX step warns and skips)

### Each release

1. Update `CHANGELOG.md` — move items out of `[Unreleased]` into a new dated section.
2. Run one of:

   ```bash
   npm run release:patch   # 0.1.0 -> 0.1.1
   npm run release:minor   # 0.1.0 -> 0.2.0
   npm run release:major   # 0.1.0 -> 1.0.0
   ```

   Each script bumps `package.json`, creates a `Release vX.Y.Z` commit, tags `vX.Y.Z`, and pushes both with `--follow-tags`. The push triggers the workflow.

3. Watch the run at <https://github.com/azizbecha/agent-device-vscode/actions/workflows/publish.yml>. The workflow refuses to run if the tag and `package.json` version don't match.

4. Verify the listing at `https://marketplace.visualstudio.com/items?itemName=<publisher>.agent-device-devtools`. Open VSX shows up at `https://open-vsx.org/extension/<publisher>/agent-device-devtools`.

### Manual dispatch

Any time you want a publish without a tag (e.g. re-running a failed publish), use **Actions → Publish → Run workflow** in the GitHub UI. The dispatch supports two checkboxes:

- **Publish as pre-release** — adds `--pre-release` to `vsce publish`. Users opted into pre-releases get the new version; everyone else sees the previous stable.
- **Also publish to Open VSX** — defaults on; uncheck to skip the Open VSX step.

## Local publish (fallback)

If the workflow is broken or you need to publish from a laptop:

1. Bump the version in `package.json` and update `CHANGELOG.md`.
2. Sanity-check — the same checks CI runs:

   ```bash
   npm run lint
   npm run format:check
   npm test
   npm run compile
   npm run package    # produces agent-device-devtools-<version>.vsix
   ```

3. Smoke-install the `.vsix`:

   ```bash
   code --install-extension agent-device-devtools-<version>.vsix
   ```

   Open a folder with `.ad` files, click the Agent Device tab, run a script.

4. Publish:

   ```bash
   npx vsce publish               # uses cached login from one-time setup
   npx vsce publish --pre-release # if you want it pre-release
   ```

5. Tag and push:

   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push --follow-tags
   ```

6. Verify on the marketplace.

## Pre-release vs stable

`package.json` currently has `"preview": true`. That marks the listing as a preview in the marketplace UI but does **not** make it a pre-release in the install-flow sense. To publish as a pre-release that only users opting into pre-releases see:

```bash
npx vsce publish --pre-release
```

When you're ready to flip to stable, drop `"preview": true` from `package.json` and run `npx vsce publish` (or `vsce publish minor` for a 1.0 push).

## Open VSX (Cursor, VSCodium, code-server, …)

VS Code Marketplace listings don't auto-mirror to Open VSX. To support Cursor and the other forks:

1. Create an account at <https://open-vsx.org>.
2. Generate an access token under your profile.
3. Publish:

   ```bash
   npx ovsx publish agent-device-devtools-<version>.vsix --pat <token>
   ```

You can wire this into CI later (the `HaaLeo/publish-vscode-extension` GitHub Action handles both marketplaces from one workflow).

## Rollback

The marketplace doesn't support deleting a published version. To roll back:

1. Bump the version (`patch` is fine).
2. Revert the offending commit on `main`.
3. `npx vsce publish patch` to ship the older code under the new version.

## Known checks the marketplace runs

- `package.json` must not have `"private": true` (we already removed it).
- `LICENSE` must exist (it does; MIT).
- `icon` must point to a 128×128 PNG (it does — `media/icon.png`, the official agent-device mark in `#8232FF` on the brand dark purple `#3b2860`).
- The README, CHANGELOG, and LICENSE are bundled into the `.vsix` (default vsce behavior).

If a publish fails, run `npx vsce ls` to inspect what's actually being included in the `.vsix` and `npx vsce package` to produce a local copy you can test.
