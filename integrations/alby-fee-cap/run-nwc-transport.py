#!/usr/bin/env python3
"""Run signed NIP-44 NWC event-handler acceptance without a relay or wallet."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('checkout', type=Path)
parser.add_argument('--go', default='go')
parser.add_argument('--race', action='store_true')
args = parser.parse_args()
base = Path(__file__).resolve().parent
checkout = args.checkout.resolve()
pin = 'a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid() == 0:
    raise SystemExit('Non-root only')
if subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip() != pin:
    raise SystemExit('Wrong upstream revision')
patches = [base / name for name in ('isolated-candidate.patch', 'unknown-outcome.patch', 'frontend-lock.patch')]
for patch in reversed(patches):
    subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=checkout, check=True)
source = base / 'bitcoinwalk_nwc_transport_test.go'
target = checkout / 'nip47/bitcoinwalk_nwc_transport_test.go'
if target.exists() and target.read_bytes() != source.read_bytes():
    raise SystemExit('Existing transport test differs; review before replacing')
shutil.copyfile(source, target)
output = base.parents[1] / 'release-build/alby-fee-cap-nwc-transport'
output.mkdir(parents=True, exist_ok=True)
manifest = output / 'manifest.json'
manifest.unlink(missing_ok=True)
command = [args.go, 'test', './nip47', '-run', '^TestBitcoinWalkEncryptedNwc(PayInvoice|DefinitiveFailureReleasesBudget)$', '-count=3', '-timeout=3m', '-json']
if args.race:
    command.append('-race')
with (output / 'transport.jsonl').open('w') as log:
    result = subprocess.run(command, cwd=checkout, env=dict(os.environ, TEST_DATABASE_URI=''), stdout=log, stderr=subprocess.STDOUT)
outcomes = []
for line in (output / 'transport.jsonl').read_text().splitlines():
    try:
        item = json.loads(line)
    except ValueError:
        continue
    if item.get('Test') and item.get('Action') in ('pass', 'fail'):
        outcomes.append({'test': item['Test'], 'result': item['Action']})
manifest.write_text(json.dumps({
    'upstream': pin, 'productionReady': False, 'exitCode': result.returncode,
    'status': 'blocked' if result.returncode else 'tested-only', 'raceDetector': args.race,
    'testSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'patches': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},
    'logSha256': hashlib.sha256((output / 'transport.jsonl').read_bytes()).hexdigest(),
    'scope': 'signed NIP-44 request and response through Hub event handler, controller and SQLite; synthetic backend, no relay or wallet',
    'outcomes': outcomes,
}, indent=2) + '\n')
for item in outcomes:
    print(f"{item['result']}: {item['test']}")
print('Deployment blocked by failed acceptance.' if result.returncode else 'Encrypted NWC boundary passed; production remains disabled.')
raise SystemExit(result.returncode)
