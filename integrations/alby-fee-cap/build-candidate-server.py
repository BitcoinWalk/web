#!/usr/bin/env python3
"""Build a default-disabled native Hub candidate release and rehearse pointer rollback."""
import argparse, gzip, hashlib, json, os, shutil, subprocess, tarfile, tempfile
from pathlib import Path

parser=argparse.ArgumentParser(); parser.add_argument('checkout',type=Path); parser.add_argument('--go',default='go'); parser.add_argument('--npx',default='npx'); args=parser.parse_args()
base=Path(__file__).resolve().parent; root=base.parents[1]; checkout=args.checkout.resolve()
pin='a231ed34a660cd86c0bd7f36282f7eb0dc90223f'; candidate='6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84'; name='bitcoinwalk-hub-candidate-'+candidate[:12]
if os.getuid()==0: raise SystemExit('Non-root only')
if subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip()!=pin: raise SystemExit('Wrong upstream revision')
if subprocess.check_output(['git','status','--porcelain'],cwd=checkout): raise SystemExit('Fresh clean checkout required')
patches=[base/n for n in ('isolated-candidate.patch','unknown-outcome.patch','legacy-failed-audit.patch','capability-binding.patch','frontend-lock.patch')]
for patch in patches: subprocess.run(['git','apply','--check',str(patch)],cwd=checkout,check=True); subprocess.run(['git','apply',str(patch)],cwd=checkout,check=True)
lock=checkout/'frontend/yarn.lock'; lock_hash=hashlib.sha256(lock.read_bytes()).hexdigest()
subprocess.run([args.npx,'--yes','yarn@1.22.22','install','--frozen-lockfile','--non-interactive','--network-timeout','300000'],cwd=checkout/'frontend',check=True)
if hashlib.sha256(lock.read_bytes()).hexdigest()!=lock_hash: raise SystemExit('Frontend lock changed')
subprocess.run([args.npx,'--yes','yarn@1.22.22','build:http'],cwd=checkout/'frontend',check=True)
env=dict(os.environ,TEST_DATABASE_URI='')
subprocess.run([args.go,'test','./...','-count=1','-timeout=15m'],cwd=checkout,env=env,check=True)
output=root/'release-build/alby-fee-cap-server'; shutil.rmtree(output,ignore_errors=True); release=output/name; (release/'bin').mkdir(parents=True); (release/'lib').mkdir()
tag='bitcoinwalk-feecap-'+candidate[:12]
subprocess.run([args.go,'build','-trimpath','-ldflags',f"-s -w -X github.com/getAlby/hub/version.Tag={tag}",'-o',str(release/'bin/albyhub'),'cmd/http/main.go'],cwd=checkout,env=env,check=True)
subprocess.run([args.go,'build','-trimpath','-ldflags','-s -w','-o',str(release/'bin/db_migrate'),'cmd/db_migrate/main.go'],cwd=checkout,env=env,check=True)
module=Path(subprocess.check_output([args.go,'list','-m','-f','{{.Dir}}','github.com/getAlby/ldk-node-go'],cwd=checkout,text=True).strip())
shutil.copy2(module/'ldk_node/x86_64-unknown-linux-gnu/libldk_node.so',release/'lib/libldk_node.so')
launcher=release/'run-disabled-candidate'; launcher.write_text('#!/usr/bin/env bash\necho "Candidate is staged but start is disabled pending a reviewed host-specific service definition." >&2\nexit 78\n'); launcher.chmod(0o755)
for script in ('stage-no-spend-candidate.sh','rollback-no-spend-candidate.sh'): shutil.copy2(base/script,release/script)
manifest={'upstream':pin,'candidateRevision':candidate,'tag':tag,'architecture':'linux-amd64','productionReady':False,'startEnabled':False,'walletDataIncluded':False,'patches':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in patches},'scope':'native server, migration binary, LDK library and default-disabled non-root staging/rollback scripts; no wallet data, credentials, recovery material or service activation'}
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
members=[p for p in sorted(release.rglob('*')) if p.is_file() and p.name!='SHA256SUMS']
(release/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(release)}\n' for p in members))
archive=output/(name+'.tar.gz')
with archive.open('wb') as raw, gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as compressed, tarfile.open(fileobj=compressed,mode='w',format=tarfile.PAX_FORMAT) as tar:
    for path in [release,*sorted(release.rglob('*'))]:
        info=tar.gettarinfo(str(path),arcname=str(Path(name)/path.relative_to(release))); info.uid=0; info.gid=0; info.uname=''; info.gname=''; info.mtime=0
        if path.is_file():
            with path.open('rb') as source: tar.addfile(info,source)
        else: tar.addfile(info)
(output/(archive.name+'.sha256')).write_text(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n')
with tempfile.TemporaryDirectory(prefix='bw-candidate-rollback-') as temp:
    target=Path(temp)/'target'; baseline=target/'releases/baseline'; baseline.mkdir(parents=True)
    marker=baseline/'baseline'; marker.write_text('baseline\n')
    (baseline/'SHA256SUMS').write_text(f'{hashlib.sha256(marker.read_bytes()).hexdigest()}  baseline\n')
    (target/'state').mkdir(); (target/'current').symlink_to(baseline); subprocess.run([str(base/'stage-no-spend-candidate.sh'),str(archive),str(target)],check=True)
    subprocess.run([str(base/'rollback-no-spend-candidate.sh'),str(target)],check=True)
    if (target/'current').resolve()!=baseline: raise SystemExit('Rollback rehearsal failed')
outer={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'releaseManifestSha256':hashlib.sha256((release/'manifest.json').read_bytes()).hexdigest(),'rollbackRehearsed':True,'productionReady':False,'startEnabled':False}
(output/'manifest.json').write_text(json.dumps(outer,indent=2)+'\n')
print(f'Built {archive}. Start remains disabled; no wallet data or service configuration included.')
