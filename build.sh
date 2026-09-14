#!/usr/bin/env bash
# Assemble the userscript: metadata block + region table + body.
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json
data = open('regions.data.json').read().rstrip()
body = open('regions.body.js').read()
marker_start = '/*__REGION_DATA__*/ null /*__END_REGION_DATA__*/'
assert marker_start in body, 'region data marker missing from regions.body.js'
# indent the JSON so the generated file stays readable
indented = '\n'.join(('  ' + l).rstrip() for l in data.split('\n'))
body = body.replace(marker_start, '\n' + indented + '\n  ')
out = open('regions.head.js').read().rstrip() + '\n\n' + body
open('ccfddl-region-filter.user.js', 'w').write(out)
json.loads(data)  # fail loudly if the table is not valid JSON
print('built ccfddl-region-filter.user.js (%d lines)' % len(out.split('\n')))
PY
