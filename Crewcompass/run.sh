#!/usr/bin/env bash
# Start CrewCompass on http://127.0.0.1:8000 (seeds simulated demo data on first run).
set -e
cd "$(dirname "$0")/backend"
exec python3 -m crewcompass "$@"
