import sqlite3
db = r'backend\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite'
c = sqlite3.connect(db).cursor()
print('installation_keys:', c.execute("SELECT installation_id, status FROM installation_keys WHERE organization_id='86cc32b9-3c6d-4208-ad57-a2a507a5c090'").fetchall())
