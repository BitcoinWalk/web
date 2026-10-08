#!/usr/bin/env python3
"""Build mock/offline test executables only. No server startup or deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('checkout', type=Path)
parser.add_argument('--go', default='go')
args = parser.parse_args()
checkout = args.checkout.resolve()
root = Path(__file__).resolve().parents[2]
patches = [Path(__file__).with_name(name) for name in ('isolated-candidate.patch', 'unknown-outcome.patch', 'legacy-failed-audit.patch', 'capability-binding.patch', 'frontend-lock.patch')]
pin = 'a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid() == 0:
    raise SystemExit('Non-root only')
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip() != pin:
    raise SystemExit('Checkout does not match the pinned upstream candidate')
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=checkout):
    raise SystemExit('Fresh clean candidate checkout required')
for patch in patches:
    subprocess.run(['git', 'apply', '--check', str(patch)], cwd=checkout, check=True)
    subprocess.run(['git', 'apply', str(patch)], cwd=checkout, check=True)
output = root / 'release-build/alby-fee-cap-isolated'
output.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, TEST_DATABASE_URI='')
manifest = {'upstream': pin, 'patches': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in patches}, 'productionReady': False, 'artifacts': {}}
for package, name, pattern in [('./transactions', 'transactions', '.'), ('./nip47/controllers', 'nwc', '.'), ('./lnclient/ldk', 'ldk', '^TestBitcoinWalkRoutingFeeCeiling$')]:
    log = output / (name + '.log')
    with log.open('w') as stream:
        subprocess.run([args.go, 'test', package, '-run', pattern, '-count=1'], cwd=checkout, env=env, stdout=stream, stderr=subprocess.STDOUT, check=True)
    artifact = output / (name + '.test')
    subprocess.run([args.go, 'test', '-c', package, '-o', str(artifact)], cwd=checkout, env=env, check=True)
    manifest['artifacts'][artifact.name] = hashlib.sha256(artifact.read_bytes()).hexdigest()
    print(f'{name}: offline/mock tests passed; test binary built')
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Isolated test build complete. No server, real wallet or payment used.')
