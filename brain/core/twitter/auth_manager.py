"""
Twitter Core Layer - Pure logic for credentials management.
"""
import json
from pathlib import Path
from typing import Dict, Any
from datetime import datetime

class TwitterAuthManager:
    def __init__(self):
        # Almacenamos en el mismo lugar que GitHub
        self.creds_path = Path.home() / ".bloom" / "twitter_creds.json"

    def get_status(self) -> Dict[str, Any]:
        """Check status without dependencies on CLI."""
        if not self.creds_path.exists():
            return {"authenticated": False, "username": None}
        
        try:
            with open(self.creds_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return {
                    "authenticated": True,
                    "username": data.get("username", "Unknown"),
                    "last_check": datetime.utcnow().isoformat()
                }
        except Exception:
            return {"authenticated": False, "username": None}