#!/usr/bin/env python3
"""Receiver-side retention: 14 daily, 8 weekly and 12 monthly restore points."""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKUP_DIR = Path(
    os.environ.get(
        "BITCOINWALK_HUB_BACKUP_DIR",
        "/home/bitcoinwalk/offhost-hub-backups/archives",
    )
)
PATTERNS = (
    (
        "candidate",
        re.compile(r"^hub-feecap-(\d{8}T\d{6}Z)-([0-9a-f]{12})\.tar\.zst\.gpg$"),
    ),
    (
        "live",
        re.compile(
            r"^hub-live-(\d{8}T\d{6}Z)-([0-9a-f]{12})-([0-9a-f]{12})\.tar\.zst\.gpg$"
        ),
    ),
)


def main() -> None:
    if not BACKUP_DIR.is_dir() or BACKUP_DIR.is_symlink():
        raise SystemExit("backup directory is missing or unsafe")
    streams: dict[str, list[tuple[datetime, Path]]] = {}
    for path in BACKUP_DIR.iterdir():
        if not path.is_file() or path.is_symlink():
            continue
        for kind, pattern in PATTERNS:
            match = pattern.fullmatch(path.name)
            if not match:
                continue
            when = datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            identity = "-".join(match.groups()[1:])
            streams.setdefault(f"{kind}:{identity}", []).append((when, path))
            break

    for rows in streams.values():
        rows.sort(reverse=True)
        keep: set[Path] = set()
        recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
        keep.update(path for when, path in rows if when >= recent_cutoff)
        for key, limit in (
            (lambda d: d.date(), 14),
            (lambda d: (d.isocalendar().year, d.isocalendar().week), 8),
            (lambda d: (d.year, d.month), 12),
        ):
            seen: set[object] = set()
            for when, path in rows:
                bucket = key(when)
                if bucket in seen or len(seen) >= limit:
                    continue
                seen.add(bucket)
                keep.add(path)

        for _, path in rows:
            if path in keep:
                continue
            checksum = path.with_name(path.name + ".sha256")
            path.unlink()
            checksum.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
