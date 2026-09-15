"""
Twitter/X Publish Commands.

Comando para publicar tweets desde Brain, usando la cuenta autenticada
vía 'brain twitter auth-login'.
"""

import typer
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class TwitterPublishCommand(BaseCommand):
    """
    Publica tweets en la cuenta de Twitter/X autenticada.

    - Registra el comando directamente en el app de la categoría TWITTER
      (mismo patrón que TwitterAuthCommand) — evita el anidado
      'brain twitter twitter publish'.
    - Requiere que 'brain twitter auth-login' se haya corrido antes con un
      token que tenga el scope 'tweet.write'. Si el token solo tiene
      lectura, la publicación falla recién al intentarlo (403), porque
      Twitter no permite introspeccionar scopes de antemano.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="twitter-publish",
            category=CommandCategory.TWITTER,
            version="1.0.0",
            description="Publica un tweet en la cuenta de Twitter/X autenticada",
            examples=[
                'brain twitter publish "Avanzando con BTIPS"',
                'brain twitter publish "Nueva build de Cognitum" --json',
                'brain twitter publish "Respuesta a un hilo" --reply-to 1234567890',
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Registra 'publish' directamente en la categoría TWITTER."""

        @app.command(name="publish")
        def publish(
            ctx: typer.Context,
            text: str = typer.Argument(
                ..., help="Texto del tweet (máx. 280 caracteres)"
            ),
            reply_to: Optional[str] = typer.Option(
                None, "--reply-to", help="ID de tweet al que responder"
            ),
        ):
            """Publica un tweet en la cuenta de Twitter/X autenticada."""

            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                # 2. Lazy import del Core
                from brain.core.twitter.tweet_publisher import TweetPublisher

                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Publicando tweet...", err=True)

                # 4. Ejecutar lógica del Core
                publisher = TweetPublisher()
                data = publisher.publish(text, reply_to_tweet_id=reply_to)

                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "twitter_publish",
                    "data": data,
                }

                # 6. Output dual
                gc.output(result, self._render_success)

            except (ValueError, RuntimeError) as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Error inesperado al publicar: {e}")

    def _render_success(self, result: dict):
        """Output humano para éxito."""
        data = result.get("data", {})
        tweet_id = data.get("tweet_id")
        text = data.get("text")
        typer.echo("✅ Tweet publicado")
        if tweet_id:
            typer.echo(f"   https://twitter.com/i/web/status/{tweet_id}")
        if text:
            typer.echo(f'   "{text}"')

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
