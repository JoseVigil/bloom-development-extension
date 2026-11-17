import sqlite3
import json

db = r'backend\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite'
conn = sqlite3.connect(db)
c = conn.cursor()

print("=== authority_admin_requests ===")
for r in c.execute("SELECT organization_id, request_id, operation, authority_version, decided_at, command_json FROM authority_admin_requests WHERE organization_id='86cc32b9-3c6d-4208-ad57-a2a507a5c090' ORDER BY rowid DESC LIMIT 5").fetchall():
    print(r[0], r[1], r[2], r[3], r[4])
    print("  Command:", r[5][:200] if r[5] else None)
