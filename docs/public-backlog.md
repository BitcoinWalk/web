# Public backlog

`https://bitcoinwalk.github.io/web/` is the canonical public, read-only projection of
`docs/project-backlog.md`. The Markdown file remains the single source of truth.

`npm run backlog:build` parses the authoritative 11 stages and every unique BW
row, then writes a static site to the ignored `public-backlog-dist/` directory.
It publishes stage, ID, title, colour status, explicit BW dependencies and a
reviewed short description from `docs/public-backlog-descriptions.json`. Each
item is a native keyboard-accessible disclosure. All items must have a public
description; missing or orphan descriptions fail the build. Internal notes are
never used to generate public prose.

**Last recorded update** is the date of the latest Git commit that added or
changed the item's tracker row or a dated item-specific checkpoint. Queue
reordering and public-copy edits do not count as item work. It describes recorded
tracker activity (including reviews), not time spent coding or a deployment date.
Unknown dates display **Not recorded**. The Pages workflow fetches complete Git
history to keep dates consistent across builds. Hash links expand the requested
item and clear filters that would hide it; descriptions are searchable.

Operational acceptance notes, addresses, backup paths, keys and
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
