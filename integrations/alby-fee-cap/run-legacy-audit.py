#!/usr/bin/env python3
"""Run the fail-closed legacy-payment audit/quarantine acceptance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
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
patches = [base / name for name in ('isolated-candidate.patch', 'unknown-outcome.patch', 'legacy-failed-audit.patch', 'capability-binding.patch', 'frontend-lock.patch')]
for patch in reversed(patches):
    subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=checkout, check=True)
output = base.parents[1] / 'release-build/alby-fee-cap-legacy-audit'
output.mkdir(parents=True, exist_ok=True)
manifest = output / 'manifest.json'
manifest.unlink(missing_ok=True)
command = [args.go, 'test', './transactions', '-run', '^TestBitcoinWalkLegacyFailed', '-count=3', '-timeout=3m', '-json']
if args.race:
    command.append('-race')
with (output / 'legacy-audit.jsonl').open('w') as log:
    result = subprocess.run(command, cwd=checkout, env=dict(os.environ, TEST_DATABASE_URI=''), stdout=log, stderr=subprocess.STDOUT)
outcomes = []
for line in (output / 'legacy-audit.jsonl').read_text().splitlines():
    try:
        item = json.loads(line)
    except ValueError:
        continue
    if item.get('Test') and item.get('Action') in ('pass', 'fail'):
        outcomes.append({'test': item['Test'], 'result': item['Action']})
manifest.write_text(json.dumps({
    'upstream': pin, 'productionReady': False, 'exitCode': result.returncode,
    'status': 'blocked' if result.returncode else 'tested-only', 'raceDetector': args.race,
    'patches': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},
    'logSha256': hashlib.sha256((output / 'legacy-audit.jsonl').read_bytes()).hexdigest(),
    'scope': 'synthetic app-scoped SQLite legacy FAILED rows; no live database, wallet, relay, credentials or funds',
    'outcomes': outcomes,
}, indent=2) + '\n')
for item in outcomes:
    print(f"{item['result']}: {item['test']}")
print('Legacy-payment quarantine acceptance failed; production remains disabled.' if result.returncode else 'Legacy-payment quarantine passed; production remains disabled pending remaining gates.')
raise SystemExit(result.returncode)
