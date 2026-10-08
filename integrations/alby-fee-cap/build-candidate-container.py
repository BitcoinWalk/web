#!/usr/bin/env python3
"""Package the verified native candidate as a rootless-Docker build context."""

import gzip
import hashlib
import json
import os
import shutil
import tarfile
from pathlib import Path


BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
REVISION = "6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84"
SHORT = REVISION[:12]
NATIVE_SHA256 = "7d16c45975f8849918ba0606081ae7b6696d1ec64a8ae8919ee9fc57cbe9a28f"
BASE_IMAGE = "debian:12-slim@sha256:a4672c0cb26fbdde88e38fa2dfb6c681942306680e41e4378b28770b6e79ee91"
CERTIFICATE_IMAGE = "golang:1.26.2-bookworm@sha256:6b9b1ff26b22fde9b31abc5c6994586f588107ee3aa54dba50626aaac5884995"
NATIVE = ROOT / "release-build" / "alby-fee-cap-server" / f"bitcoinwalk-hub-candidate-{SHORT}.tar.gz"
OUTPUT = ROOT / "release-build" / "alby-fee-cap-container"
CONTEXT = OUTPUT / f"bitcoinwalk-hub-container-{SHORT}"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    for member in members:
        path = Path(member.name)
        if path.is_absolute() or ".." in path.parts or not (member.isdir() or member.isfile()):
            raise SystemExit(f"Unsafe native package entry: {member.name}")
    return members


if os.getuid() == 0:
    raise SystemExit("Non-root only")
if not NATIVE.is_file() or digest(NATIVE) != NATIVE_SHA256:
    raise SystemExit("Verified native candidate archive is missing or changed")

shutil.rmtree(OUTPUT, ignore_errors=True)
(CONTEXT / "release").mkdir(parents=True)
with tarfile.open(NATIVE) as archive:
    members = safe_members(archive)
    archive.extractall(CONTEXT / "native", members=members, filter="data")

native_roots = [path for path in (CONTEXT / "native").iterdir() if path.is_dir()]
if len(native_roots) != 1:
    raise SystemExit("Native package must contain exactly one release")
native_release = native_roots[0]
manifest = json.loads((native_release / "manifest.json").read_text())
if manifest.get("candidateRevision") != REVISION:
    raise SystemExit("Native candidate revision changed")
if manifest.get("productionReady") is not False or manifest.get("startEnabled") is not False:
    raise SystemExit("Native candidate safety markers changed")
shutil.copytree(native_release, CONTEXT / "release", dirs_exist_ok=True)
shutil.rmtree(CONTEXT / "native")

for name in (
    "Dockerfile.candidate",
    "container-entrypoint.sh",
    "compose.candidate.yaml",
    "stage-rootless-container-candidate.sh",
    "rollback-rootless-container-candidate.sh",
):
    shutil.copy2(BASE / name, CONTEXT / name)

container_manifest = {
    "candidateRevision": REVISION,
    "nativeArchive": NATIVE.name,
    "nativeArchiveSha256": NATIVE_SHA256,
    "baseImage": BASE_IMAGE,
    "certificateImage": CERTIFICATE_IMAGE,
    "architecture": "linux-amd64",
    "productionReady": False,
    "startEnabled": False,
    "walletDataIncluded": False,
    "deployment": "rootless Docker only; staged container remains stopped",
}
(CONTEXT / "container-manifest.json").write_text(json.dumps(container_manifest, indent=2) + "\n")

files = [path for path in sorted(CONTEXT.rglob("*")) if path.is_file() and path.name != "SHA256SUMS"]
(CONTEXT / "SHA256SUMS").write_text(
    "".join(f"{digest(path)}  {path.relative_to(CONTEXT)}\n" for path in files)
)

archive_path = OUTPUT / f"bitcoinwalk-hub-container-{SHORT}.tar.gz"
with archive_path.open("wb") as raw:
    with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for path in [CONTEXT, *sorted(CONTEXT.rglob("*"))]:
                info = archive.gettarinfo(str(path), arcname=str(Path(CONTEXT.name) / path.relative_to(CONTEXT)))
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                info.mtime = 0
                if path.is_file():
                    with path.open("rb") as source:
                        archive.addfile(info, source)
                else:
                    archive.addfile(info)

archive_sha = digest(archive_path)
(OUTPUT / f"{archive_path.name}.sha256").write_text(f"{archive_sha}  {archive_path.name}\n")
(OUTPUT / "manifest.json").write_text(
    json.dumps({**container_manifest, "archive": archive_path.name, "sha256": archive_sha}, indent=2) + "\n"
)
print(f"Built {archive_path} ({archive_sha}). Container start remains disabled.")
