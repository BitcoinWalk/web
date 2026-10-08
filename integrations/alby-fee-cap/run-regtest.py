#!/usr/bin/env python3
"""Opt-in private routing test; never starts or connects to the production Hub."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('checkout', type=Path)
parser.add_argument('--bitcoind', required=True, type=Path)
parser.add_argument('--go', default='go')
args = parser.parse_args()
base = Path(__file__).resolve().parent
checkout = args.checkout.resolve()
binary = args.bitcoind.resolve(strict=True)
pin = 'a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid() == 0:
    raise SystemExit('Non-root only')
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip() != pin:
    raise SystemExit('Wrong upstream revision')
subprocess.run(['git', 'apply', '--reverse', '--check', str(base / 'isolated-candidate.patch')], cwd=checkout, check=True)
source = base / 'bitcoinwalk_regtest_test.go'
target = checkout / 'lnclient/ldk/bitcoinwalk_regtest_test.go'
if target.exists() and target.read_bytes() != source.read_bytes():
    raise SystemExit('Existing regtest file differs; review it before replacing')
shutil.copyfile(source, target)
output = base.parents[1] / 'release-build/alby-fee-cap-regtest'
output.mkdir(parents=True, exist_ok=True)
manifest_path = output / 'manifest.json'
# A failed rerun must not leave a stale success manifest.
manifest_path.unlink(missing_ok=True)
env = dict(os.environ, BW_REGTEST_BITCOIND=str(binary), TEST_DATABASE_URI='')
with (output / 'regtest.log').open('w') as log:
    subprocess.run([args.go, 'test', './lnclient/ldk', '-run', '^TestBitcoinWalkPrivateRegtest$', '-count=3', '-timeout=8m', '-v'], cwd=checkout, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
manifest = {
    'upstream': pin,
    'patchSha256': hashlib.sha256((base / 'isolated-candidate.patch').read_bytes()).hexdigest(),
    'testSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'bitcoindSha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
    'logSha256': hashlib.sha256((output / 'regtest.log').read_bytes()).hexdigest(),
    'network': 'private regtest', 'runsPassed': 3, 'productionReady': False,
    'scope': 'native LDK routing and settled-state reconstruction; not full Hub/NWC recovery',
}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('Three private regtest runs passed. All temporary nodes stopped; live Hub unchanged.')
