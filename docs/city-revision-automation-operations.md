# Disabled city revision automation staging package

This package contains the bounded BW-78 revision worker and one fixed read-only
staging check. Installation creates no signer, signed policy, service, timer or
application enable flag. It cannot approve or publish a revision in this state.

Install the extracted package as root:

```sh
sudo ./install-disabled.sh
```

Then run the check as the unprivileged `bitcoinwalk` account:

```sh
/opt/bitcoinwalk-city-revision-automation/0.1.0/check-staging.sh
```

The check reads current staging relay records and reports only eligible revision
and city IDs. It unsets credential and payment-database paths and always invokes
the worker with `--dry-run`. It does not open SQLite, write audit state, sign an
event or connect to a publication path.

Do not add a signer or policy until the report has been reviewed, the matching
relay build is deployed with its automation key unset, and one exact revision is
chosen for a separately authorized pilot.
