#!/usr/bin/env bash
# lock.sh — compile requirements.in and requirements-dev.in into the exact files the image, CI and
# every venv install (spec 0007, ADR-0010). The .txt files are generated: never edit them by hand.
#
#   ./scripts/lock.sh                          after adding or removing a line in a .in file; every
#                                              other version stays where the lock already has it
#   ./scripts/lock.sh --upgrade-package NAME   move one package, and whatever it has to drag along
#
# Dependabot recompiles the same files with the command written in their headers, so a pull request
# it opens has been through a resolver. Editing the flat file line by line is how #23 proposed a
# pydantic_core that no released pydantic accepts.
#
# pip-tools runs from a throwaway venv, so it never enters the app's environment, and the three
# tools are exact here for the reason everything else is. click is held at 8.2.1 because pip-tools
# 7.6.1 under click 8.5.0 writes a spurious `--no-index` into the header, which is the command
# Dependabot replays.
set -euo pipefail
cd "$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

PIP=26.2.1
PIP_TOOLS=7.6.1
CLICK=8.2.1

py="$(command -v python3.12 || true)"
[ -n "$py" ] || { echo "lock.sh: python3.12 not found; the header records the Python it ran on" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
"$py" -m venv "$tmp/venv"
"$tmp/venv/bin/python" -m pip install --quiet "pip==$PIP" "pip-tools==$PIP_TOOLS" "click==$CLICK"

# Runtime first: requirements-dev.in reads `-c requirements.txt`, so it has to see the new lock.
for name in requirements requirements-dev; do
  "$tmp/venv/bin/pip-compile" --quiet --strip-extras --output-file="$name.txt" "$name.in" "$@"
done
