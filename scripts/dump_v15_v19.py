import sqlite3
import json

db = r'backend\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite'
conn = sqlite3.connect(db)
c = conn.cursor()

for r in c.execute("SELECT authority_version, request_id, operation, decided_at, command_json FROM authority_admin_requests WHERE organization_id='86cc32b9-3c6d-4208-ad57-a2a507a5c090' AND CAST(authority_version AS INT) >= 15 ORDER BY CAST(authority_version AS INT) ASC").fetchall():
    print(f"=== v{r[0]} {r[1]} ({r[2]}) ===")
    print(json.dumps(json.loads(r[4]), indent=2))
