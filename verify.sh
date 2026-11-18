#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
set -euo pipefail
npm run typecheck
npm run build
node dist/scripts/source-check.js
node --test test/*.test.mjs
npm audit --audit-level=low
node dist/scripts/demo.js
node dist/scripts/assets.js
node dist/scripts/release-check.js
printf 'ALL GREEN\n'
