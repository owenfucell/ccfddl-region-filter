#!/usr/bin/env bash
# Assemble the userscript: metadata block + region table + body.
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json, re
data = open('regions.data.json').read().rstrip()
body = open('regions.body.js').read()
marker_start = '/*__REGION_DATA__*/ null /*__END_REGION_DATA__*/'
assert marker_start in body, 'region data marker missing from regions.body.js'

# single source of truth for the version: the @version line in the metadata block
head = open('regions.head.js').read()
version = re.search(r'^// @version\s+(\S+)', head, re.M).group(1)
vmarker = "/*__VERSION__*/ '0.0.0' /*__END_VERSION__*/"
assert vmarker in body, 'version marker missing from regions.body.js'
body = body.replace(vmarker, "'%s'" % version)
# indent the JSON so the generated file stays readable
indented = '\n'.join(('  ' + l).rstrip() for l in data.split('\n'))
body = body.replace(marker_start, '\n' + indented + '\n  ')
out = open('regions.head.js').read().rstrip() + '\n\n' + body
open('ccfddl-region-filter.user.js', 'w').write(out)
json.loads(data)  # fail loudly if the table is not valid JSON
print('built ccfddl-region-filter.user.js (%d lines)' % len(out.split('\n')))
PY
