"""Verify public metadata through YouTube oEmbed; this does not prove regional playback."""
import json
from pathlib import Path
from urllib.request import urlopen
from urllib.error import HTTPError
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
path = Path('api/catalog.json')
rows = json.loads(path.read_text())
def check(row):
    url = 'https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + row['id']
    try:
        with urlopen(url, timeout=15) as r:
            meta = json.load(r)
        row.update(title=meta['title'], channel=meta['author_name'], metadataCheckedAt=datetime.now(timezone.utc).date().isoformat())
        return row, 'OK'
    except HTTPError as e:
        return row, str(e.code)
    except Exception:
        return row, 'NETWORK_ERROR'
results=list(ThreadPoolExecutor(max_workers=8).map(check, rows))
for row,status in results: print(status, row['id'], row['title'], flush=True)
# Drop only definitively unavailable candidates, keep network failures marked as unverified.
path.write_text(json.dumps([r for r,s in results if s not in ('400','401','403','404')], indent=2)+'\n')
Path('tests/catalog-check.json').write_text(json.dumps([dict(id=r['id'],status=s) for r,s in results],indent=2)+'\n')
