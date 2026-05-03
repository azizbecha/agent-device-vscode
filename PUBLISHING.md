# Publishing to the VS Code Marketplace

These steps assume the work that's already in this repo: the `package.json` `publisher`, `version`, `icon`, `keywords`, `repository`, `bugs`, `homepage`, `galleryBanner`, and `preview` fields are configured. The `LICENSE`, `README.md`, and `CHANGELOG.md` are present. CI is green on `main`.

## One-time setup

1. **Create a publisher**

   Visit <https://marketplace.visualstudio.com/manage> and sign in with the Microsoft account that should own the listing. Click "Create publisher" and pick an ID. Update `package.json` `publisher` to match.

   > Right now `package.json` has `"publisher": "agent-device"`. That string must match a publisher you (or your org) actually own on the marketplace.

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

## Each release

1. **Bump the version** in `package.json` (semver). Update `CHANGELOG.md` to add a section for the new version and move items out of `[Unreleased]`.

2. **Sanity check** — the same checks CI runs:

   ```bash
   npm run lint
   npm run format:check
   npm test
   npm run compile
   npm run package    # produces agent-device-vscode-<version>.vsix
   ```

3. **Smoke-install the `.vsix`** locally:

   ```bash
   code --install-extension agent-device-vscode-<version>.vsix
   ```

   Open a folder with `.ad` files, click the Agent Device tab, run a script.

4. **Publish**:

   ```bash
   npx vsce publish
   ```

   Or, to bump and publish in one step:

   ```bash
   npx vsce publish patch
   npx vsce publish minor
   npx vsce publish major
   ```

   These bump `package.json` for you, commit the bump, and tag.

5. **Tag and push** if you bumped manually:

   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push --tags
   ```

6. **Verify on the marketplace** at `https://marketplace.visualstudio.com/items?itemName=<publisher>.agent-device-vscode`.

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
   npx ovsx publish agent-device-vscode-<version>.vsix --pat <token>
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
