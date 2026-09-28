# Public backlog

`https://bitcoinwalk.github.io/web/` is the canonical public, read-only projection of
`docs/project-backlog.md`. The Markdown file remains the single source of truth.

`npm run backlog:build` parses the authoritative 11 stages and every unique BW
row, then writes a static site to the ignored `public-backlog-dist/` directory.
It deliberately publishes only stage, ID, title, colour status and explicit BW
dependencies. Operational acceptance notes, addresses, backup paths, keys and
other internal detail are not copied to the rendered page. The generator fails
if a duplicate ID, unexpected status, incomplete stage set or known sensitive
pattern reaches the output.

The `Publish public backlog` GitHub Actions workflow runs whenever the tracker,
generator or workflow changes on `main`, and may also be started manually. It
deploys the generated directory to GitHub Pages. The repository Pages source
must be **GitHub Actions**. No custom domain is required; use the repository's
GitHub Pages URL directly.

Acceptance:

1. `npm run backlog:check` succeeds locally and in CI.
2. The GitHub Pages URL responds over HTTPS.
3. The public page contains all 11 stages and every unique BW item, and contains
   none of the excluded operational detail.
4. Change a harmless backlog status on a test branch, verify the generated diff,
   then merge it and confirm the live page updates without a manual deployment.
