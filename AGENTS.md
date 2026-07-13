# Repository instructions

Every push to `main` is released automatically by `.github/workflows/publish.yml`. The workflow increments the patch version in `package.json` and `package-lock.json`, validates the package, commits the release version, creates the matching `v*` tag, and publishes to npm through Trusted Publishing (OIDC). A concurrency group serializes releases, and GitHub's built-in token prevents the generated release commit/tag from recursively starting another workflow.

Before pushing a package change to `main`:

1. Run `npm run typecheck`, `npm test`, and `npm pack --dry-run`.
2. Commit and push the change without manually bumping the version for an ordinary main-branch release.
3. Let the workflow create the patch version commit and tag and publish only after validation succeeds.
4. Verify the release with `npm view is-fast-internet@<version> --registry=https://registry.npmjs.org/`; do not consider it complete until npm serves the new version.

Do not publish commits from branches other than `main`.

## Demo synchronization

`docs/demo.js` must derive the package probe list from the built
`getDefaultProbes()` export. Do not reintroduce a copied default-probe list in
the demo.

After pushing any change that can affect the demo or its probe set, wait for
the GitHub Pages workflow to succeed, then verify the deployed assets with
cache-busted requests. Compare the SHA-256 hashes of the live
`demo.js` and `is-fast-internet.js` with local `docs/demo.js` and
`dist/index.js`; do not consider the demo deployment complete until both match.
