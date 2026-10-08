#!/usr/bin/env python3
"""Run one opt-in synthetic NWC request/response through a reviewed real relay."""
import argparse, hashlib, json, os, shutil, subprocess
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('checkout',type=Path); parser.add_argument('--go',default='go')
parser.add_argument('--relay',required=True,choices=('wss://relay.getalby.com','wss://relay2.getalby.com'))
parser.add_argument('--accept-real-relay',action='store_true')
args=parser.parse_args(); base=Path(__file__).resolve().parent; root=base.parents[1]; checkout=args.checkout.resolve()
pin='a231ed34a660cd86c0bd7f36282f7eb0dc90223f'
if os.getuid()==0: raise SystemExit('Non-root only')
if not args.accept_real_relay: raise SystemExit('Explicit --accept-real-relay is required')
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip()!=pin: raise SystemExit('Wrong upstream revision')
patches=[base/name for name in ('isolated-candidate.patch','unknown-outcome.patch','legacy-failed-audit.patch','capability-binding.patch','frontend-lock.patch')]
for patch in reversed(patches): subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=checkout,check=True)
sources=('bitcoinwalk_nwc_transport_test.go','bitcoinwalk_nwc_relay_test.go')
for name in sources: shutil.copy2(base/name,checkout/'nip47'/name)
output=root/'release-build/alby-fee-cap-relay-acceptance'; output.mkdir(parents=True,exist_ok=True)
log=output/'relay-acceptance.jsonl'; env=dict(os.environ,TEST_DATABASE_URI='',BW_NWC_RELAY_ACCEPTANCE='1',BW_NWC_RELAY=args.relay)
result=subprocess.run([args.go,'test','./nip47','-run','^TestBitcoinWalkRealRelayNoFundsAcceptance$','-count=1','-timeout=2m','-json'],cwd=checkout,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
outcomes=[]
for line in result.stdout.splitlines():
    try: item=json.loads(line)
    except ValueError: continue
    if item.get('Test') and item.get('Action') in ('pass','fail'): outcomes.append({'test':item['Test'],'result':item['Action']})
log.write_text(''.join(json.dumps(item,separators=(',',':'))+'\n' for item in outcomes))
manifest={'upstream':pin,'productionReady':False,'exitCode':result.returncode,'status':'blocked' if result.returncode else 'tested-only','candidateRevision':'6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84','relay':args.relay,'testSha256':hashlib.sha256((base/'bitcoinwalk_nwc_relay_test.go').read_bytes()).hexdigest(),'patches':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'scope':'one synthetic encrypted NWC request/response through a reviewed external NWC relay and the patched Hub handler; temporary SQLite and mock LN only; no NWC URI, wallet, node credentials, real invoice or funds','outcomes':outcomes}
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Real-relay no-funds acceptance failed; production remains disabled.' if result.returncode else 'Real-relay no-funds acceptance passed; production remains disabled pending deployment authorization and live operational controls.')
raise SystemExit(result.returncode)
