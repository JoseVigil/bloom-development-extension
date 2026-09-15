"""
Twitter/X Tweet Publisher.

Lógica de negocio pura para publicar tweets vía la API v2 de X.
Sin dependencias de Typer/CLI — ver brain/commands/twitter/publish.py
para la capa CLI que consume esta clase.
"""

from typing import Any, Dict, Optional

import requests

TWITTER_API_TWEETS_URL = "https://api.twitter.com/2/tweets"
MAX_TWEET_LENGTH = 280


class TweetPublisher:
    """
    Publica tweets usando el access token guardado por TwitterAuthManager.

    Requiere que el token almacenado tenga el scope `tweet.write`. Un token
    obtenido solo con `tweet.read users.read` no falla al leerlo — falla
    recién acá, con un 403 de la API, porque Twitter no expone ninguna forma
    de introspeccionar scopes de un token antes de usarlo.
    """

    def __init__(self, access_token: Optional[str] = None):
        """
        Args:
            access_token: Token a usar. Si se omite, se resuelve en el
                momento de publicar contra TwitterAuthManager (permite
                instanciar el publisher antes de saber si hay sesión).
        """
        self._access_token = access_token

    def _resolve_token(self) -> str:
        if self._access_token:
            return self._access_token

        from brain.core.twitter.auth_manager import TwitterAuthManager

        manager = TwitterAuthManager()
        token = manager.get_access_token()
        if not token:
            raise ValueError(
                "No hay ninguna cuenta de Twitter/X autenticada. "
                "Corré 'brain twitter auth-login' primero."
            )
        return token

    def publish(
        self,
        text: str,
        reply_to_tweet_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Publica un tweet.

        Args:
            text: Contenido del tweet. Máximo 280 caracteres.
            reply_to_tweet_id: Si se pasa, publica como respuesta a ese tweet.

        Returns:
            Dict con `tweet_id` y `text` del tweet creado.

        Raises:
            ValueError: Texto vacío, texto demasiado largo, o no hay token
                guardado.
            RuntimeError: La API de Twitter devolvió un error (401, 403,
                u otro código de fallo).
        """
        if not text or not text.strip():
            raise ValueError("El texto del tweet no puede estar vacío")

        if len(text) > MAX_TWEET_LENGTH:
            raise ValueError(
                f"El texto excede el límite de {MAX_TWEET_LENGTH} caracteres "
                f"(tiene {len(text)})"
            )

        token = self._resolve_token()

        payload: Dict[str, Any] = {"text": text}
        if reply_to_tweet_id:
            payload["reply"] = {"in_reply_to_tweet_id": reply_to_tweet_id}

        response = requests.post(
            TWITTER_API_TWEETS_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

        if response.status_code == 401:
            raise RuntimeError(
                "Token rechazado (401). Puede haber expirado o ser inválido. "
                "Volvé a correr 'brain twitter auth-login' con un token nuevo."
            )
        if response.status_code == 403:
            raise RuntimeError(
                "Twitter rechazó la publicación (403). El motivo más probable "
                "es que el token no tiene el scope 'tweet.write' — solo sirve "
                "para leer, no para publicar."
            )
        if not response.ok:
            raise RuntimeError(
                f"Twitter devolvió un error {response.status_code}: {response.text}"
            )

        data = response.json().get("data", {})
        return {
            "tweet_id": data.get("id"),
            "text": data.get("text", text),
        }
