import sqlite3
import json

db = r'backend\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite'
conn = sqlite3.connect(db)
c = conn.cursor()

tables = [row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print('Tables:', tables)

for t in tables:
    if 'emission' in t or 'grant' in t:
        print(f'\n=== {t} ===')
        cols = [col[1] for col in c.execute(f"PRAGMA table_info({t})").fetchall()]
        print('Cols:', cols)
        for r in c.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 3").fetchall():
            print(r)
