# Repository instructions

When committing requested package changes and pushing them to `main`, publish the corresponding release to npm as part of the same workflow.

Before publishing:

1. Run `npm run typecheck`, `npm test`, and `npm pack --dry-run`.
2. Ensure the version in `package.json` has not already been published. If it has, increment it according to semantic versioning before committing.
3. Publish only after the commit has been pushed successfully to `origin/main`.
4. Publish the public package with `npm publish --access public --registry=https://registry.npmjs.org/` and verify it with `npm view is-fast-internet@<version> --registry=https://registry.npmjs.org/`.

Do not publish commits from branches other than `main`.
