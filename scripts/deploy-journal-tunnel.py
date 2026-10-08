#!/usr/bin/env python3
"""Local orchestrator for fixed synthetic staging hosts. Never prints tokens."""
import shlex
import subprocess

app = 'bitcoinwalk@213.232.235.138'
journal = 'bitcoinwalk@213.232.235.240'
opts = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-i', '/home/endo/.ssh/id_ed25519']
hostkey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPtlWHDin+xLvZmT0NSgwmcc7TMDLvG66p9UFDDMQ6Ri'
remote = '/home/bitcoinwalk/incoming/install-journal-tunnel.py'

def ssh(host, command, data=None):
    return subprocess.run(['ssh', *opts, host, command], input=data, capture_output=True, check=True).stdout

def py(host, code, data=None):
    return ssh(host, 'python3 -c ' + shlex.quote(code), data)

for host in [app, journal]:
    subprocess.run(['scp', *opts, 'scripts/install-journal-tunnel.py', host + ':' + remote], check=True)
subprocess.run(['scp', *opts, 'release-build/test-journal-tunnel.cjs', app + ':/home/bitcoinwalk/incoming/test-journal-tunnel.cjs'], check=True)
public = ssh(app, f'python3 {remote} key').decode().strip()
ssh(journal, f'python3 {remote} authorize ' + shlex.quote(public))

# The journal's operator credential never leaves its host. Only the client token
# and public identity pins cross these already pinned administration connections.
payload = py(journal, '''
import json,urllib.request,hashlib
from pathlib import Path
p=Path('/home/bitcoinwalk/journal-staging-0.1.0/state')
token=(p/'client.token').read_text().strip()
req=urllib.request.Request('http://127.0.0.1:8891/v1/journal/status',headers={'Authorization':'Bearer '+token})
s=json.load(urllib.request.urlopen(req,timeout=5))
assert s['binding']==hashlib.sha256(b'bitcoinwalk-isolated-journal-staging-no-wallet-v1').hexdigest() and not s['active']
print(json.dumps({'token':token,'pin':{'serviceId':s['serviceId'],'binding':s['binding']}}))
''')
py(app, '''
import json,os,sys
from pathlib import Path
os.umask(0o077)
p=Path('/home/bitcoinwalk/.config/bitcoinwalk-journal-tunnel')
d=json.load(sys.stdin)
with (p/'client.token').open('x') as f:f.write(d['token'])
with (p/'fixture-pin.json').open('x') as f:json.dump(d['pin'],f)
''', payload)
del payload
ssh(app, f'python3 {remote} install ' + shlex.quote(hostkey))
node = '/opt/bitcoinwalk-app-staging/runtime/bin/node /home/bitcoinwalk/incoming/test-journal-tunnel.cjs '
ctl = 'XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user '
# Readiness retry is bounded; messages contain no response body or credential.
ssh(app, 'for attempt in 1 2 3 4 5; do ' + node + 'paused && exit 0; sleep 1; done; exit 1')

keyroot = '/home/bitcoinwalk/.config/bitcoinwalk-journal-tunnel'
restricted = f'/usr/bin/ssh -F /dev/null -i {keyroot}/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile={keyroot}/known_hosts -o ConnectTimeout=5 '
py(app, f'''
import subprocess,shlex
base=shlex.split({restricted!r})
for args in [['bitcoinwalk@213.232.235.240','true'],['-W','127.0.0.1:8890','bitcoinwalk@213.232.235.240'],['-W','127.0.0.1:22','bitcoinwalk@213.232.235.240']]:
 r=subprocess.run(base+args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
 assert r.returncode!=0,'Restricted key unexpectedly allowed forbidden access'
print('Shell and unrelated forwarding rejected')
''')

def control(action):
    py(journal, '''
import json,urllib.request,hashlib
from pathlib import Path
p=Path('/home/bitcoinwalk/journal-staging-0.1.0/state')
def call(path,token,body=None):
 r=urllib.request.Request('http://127.0.0.1:8891/v1/journal/'+path,data=json.dumps(body).encode() if body else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(r,timeout=5))
s=call('status',(p/'client.token').read_text().strip())
assert s['binding']==hashlib.sha256(b'bitcoinwalk-isolated-journal-staging-no-wallet-v1').hexdigest()
call('control',(p/'operator.token').read_text().strip(),{'serviceId':s['serviceId'],'expectedFence':s['fence'],'action':ACTION})
'''.replace('ACTION', repr(action)))

try:
    control('activate')
    print(ssh(app, node + 'claim').decode().strip())
    ssh(app, ctl + 'stop bitcoinwalk-journal-tunnel.service')
    print(ssh(app, node + 'outage').decode().strip())
finally:
    control('pause')
    ssh(app, ctl + 'start bitcoinwalk-journal-tunnel.service')
ssh(app, 'for attempt in 1 2 3 4 5; do ' + node + 'paused && exit 0; sleep 1; done; exit 1')
print('Dedicated cross-host tunnel verified; journal paused; no wallet or app rollout.')
