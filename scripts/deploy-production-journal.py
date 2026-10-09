#!/usr/bin/env python3
"""Deploy the paused journal and restricted reverse tunnel without logging secrets."""
import hashlib
import json
from pathlib import Path
import shlex
import subprocess

rustress = 'bitcoinwalk@213.232.235.240'
app = 'bitcoinwalk@213.232.235.138'
opts = ['-F', '/dev/null', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'IdentitiesOnly=yes', '-i', '/home/endo/.ssh/id_ed25519']
app_hostkey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILNUSY9JQ9r373Jjk+EEH0jBd/UnOCrtebtb2FYhz0LV'
helper = '/home/bitcoinwalk/incoming/install-production-journal-tunnel.py'

def ssh(host, command, data=None):
    return subprocess.run(['ssh', *opts, host, command], input=data, capture_output=True, check=True).stdout

def py(host, code, data=None):
    return ssh(host, 'python3 -c ' + shlex.quote(code), data)

archive = Path('release-build/bitcoinwalk-remote-journal-0.1.0.tar.gz')
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
subprocess.run(['scp', *opts, archive, f'{app}:/home/bitcoinwalk/incoming/'], check=True)
subprocess.run(['scp', *opts, 'scripts/install-production-journal.py', f'{app}:/home/bitcoinwalk/incoming/'], check=True)
for host in [rustress, app]:
    subprocess.run(['scp', *opts, 'scripts/install-production-journal-tunnel.py', f'{host}:{helper}'], check=True)

# Binding is read through the existing authenticated, read-only shadow and held
# only in subprocess memory before it becomes private journal configuration.
binding = py(rustress, '''
import json,urllib.request
from pathlib import Path
p=Path('/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/secrets/shadow-api-token')
token=p.read_text().strip()
r=urllib.request.Request('http://127.0.0.1:8892/v1/readiness',headers={'Authorization':'Bearer '+token})
d=json.load(urllib.request.urlopen(r,timeout=5))
assert d['state']=='verified' and isinstance(d['binding'],str) and len(d['binding'])==64
print(d['binding'])
''').strip()
ssh(app, f'python3 /home/bitcoinwalk/incoming/install-production-journal.py /home/bitcoinwalk/incoming/{archive.name} {digest}', binding + b'\n')

public = ssh(rustress, f'python3 {helper} key').decode().strip()
ssh(app, f'python3 {helper} authorize ' + shlex.quote(public))
payload = py(app, '''
import json,urllib.request
from pathlib import Path
p=Path('/home/bitcoinwalk/journal-production-0.1.0/state')
token=(p/'client.token').read_text().strip()
r=urllib.request.Request('http://127.0.0.1:8894/v1/journal/status',headers={'Authorization':'Bearer '+token})
s=json.load(urllib.request.urlopen(r,timeout=5))
assert not s['active']
print(json.dumps({'token':token,'pin':{'serviceId':s['serviceId'],'binding':s['binding']}}))
''')
py(rustress, '''
import json,os,sys
from pathlib import Path
os.umask(0o077)
p=Path('/home/bitcoinwalk/.config/bitcoinwalk-payout-journal')
p.mkdir(mode=0o700,exist_ok=True)
d=json.load(sys.stdin)
with (p/'client.token').open('x') as f:f.write(d['token'])
with (p/'journal-pin.json').open('x') as f:json.dump(d['pin'],f)
''', payload)
del payload
ssh(rustress, f'python3 {helper} install ' + shlex.quote(app_hostkey))

py(rustress, '''
import json,urllib.request
from pathlib import Path
p=Path('/home/bitcoinwalk/.config/bitcoinwalk-payout-journal')
pin=json.loads((p/'journal-pin.json').read_text())
token=(p/'client.token').read_text().strip()
r=urllib.request.Request('http://127.0.0.1:18894/v1/journal/status',headers={'Authorization':'Bearer '+token})
s=json.load(urllib.request.urlopen(r,timeout=5))
assert s['serviceId']==pin['serviceId'] and s['binding']==pin['binding'] and not s['active'] and s['lastSequence']==0
''')
print('Production journal and restricted reverse tunnel verified paused; no wallet action performed.')
