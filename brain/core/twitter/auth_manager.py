import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

class TwitterAuthManager:
    def __init__(self):
        self.creds_path = Path.home() / ".bloom" / "twitter_creds.json"

    def get_status(self) -> Dict[str, Any]:
        if not self.creds_path.exists():
            return {"authenticated": False, "username": None}
        try:
            data = json.loads(self.creds_path.read_text(encoding='utf-8'))
            return {
                "authenticated": True, 
                "username": data.get("username"),
                "timestamp": data.get("updated_at")
            }
        except:
            return {"authenticated": False, "username": None}

    def save_auth(self, token: str, username: str):
        self.creds_path.parent.mkdir(parents=True, exist_ok=True)
        self.creds_path.write_text(json.dumps({
            "token": token,
            "username": username,
            "updated_at": datetime.utcnow().isoformat()
        }), encoding='utf-8')

    def logout(self):
        if self.creds_path.exists():
            self.creds_path.unlink()