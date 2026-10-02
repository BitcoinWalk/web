# Deployment scripts

Routine staging app deployments use the existing non-root helper
`/home/bitcoinwalk/bin/deploy-staging-app` on `.138`, as user `bitcoinwalk`.
See [current runbook](../docs/app-staging-runbook.md).

Version-specific installers here are historical recovery/rehearsal evidence,
not a sequence to execute and not the normal deployment interface. Retain scripts
still used by tests or infrastructure runbooks until their replacement is verified.

The 2 October housekeeping removed four superseded early app installers and the
rejected directory installers 0.3.71/72, their manifests and five text-only tests.
They remain recoverable from Git before this housekeeping commit and from the
preproduction backup. Corrected directory behavior tests and packaging checks remain.
