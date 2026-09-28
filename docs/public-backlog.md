# Public backlog

`https://backlog.bitcoinwalk.org` is a public, read-only projection of
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
must be **GitHub Actions**, and the custom domain must be
`backlog.bitcoinwalk.org`. DNS should use a CNAME to the GitHub Pages hostname
shown by the repository Pages settings. Enable HTTPS only after GitHub verifies
the DNS record and issues the certificate.

Acceptance:

1. `npm run backlog:check` succeeds locally and in CI.
2. GitHub Pages reports the custom domain as verified with HTTPS enforced.
3. The public page contains all 11 stages and every unique BW item, and contains
   none of the excluded operational detail.
4. Change a harmless backlog status on a test branch, verify the generated diff,
   then merge it and confirm the live page updates without a manual deployment.
