#!/bin/bash
# Dispatch the versioned, checksum-verified documentation installer.
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
package_dir=$(cd "$script_dir/.." && pwd)
version=$(cat "$package_dir/VERSION")
export BITCOINWALK_DOCUMENTATION_VERSION="$version"
exec "$script_dir/install-documentation-0.1.0.sh"
