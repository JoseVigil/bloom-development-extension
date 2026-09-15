import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

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

    def get_access_token(self) -> Optional[str]:
        """
        Devuelve el access token guardado, o None si no hay cuenta autenticada.

        Usado por TweetPublisher para autenticar contra la API v2 de X.
        No valida si el token sigue vigente ni si tiene el scope tweet.write —
        eso lo determina la respuesta de la API al momento de publicar.
        """
        if not self.creds_path.exists():
            return None
        try:
            data = json.loads(self.creds_path.read_text(encoding='utf-8'))
            return data.get("token")
        except Exception:
            return None

    def logout(self):
        if self.creds_path.exists():
            self.creds_path.unlink()