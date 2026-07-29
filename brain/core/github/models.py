"""
GitHub domain models — lógica pura, sin dependencias de CLI.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class Repository:
    """
    Representa un repositorio de GitHub.

    Los nombres de campo siguen la convención ya usada por
    brain/commands/github/repos.py (full_name, private, stars, language,
    description, html_url, clone_url, updated_at) — confirmados por grep
    sobre ese archivo antes de escribir esta clase, no inferidos de la
    respuesta cruda de la API de GitHub.
    """

    full_name: str
    name: str
    private: bool
    html_url: str
    clone_url: str
    stars: int = 0
    language: Optional[str] = None
    description: Optional[str] = None
    updated_at: Optional[str] = None
    id: Optional[int] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Repository":
        """
        Construye un Repository desde la respuesta cruda de la API de
        GitHub (GET /user/repos, /orgs/{org}/repos, /repos/{owner}/{repo}).

        Nota: el campo de estrellas en la API de GitHub se llama
        'stargazers_count', no 'stars' — se mapea acá.
        """
        return cls(
            id=data.get("id"),
            name=data.get("name", ""),
            full_name=data.get("full_name", ""),
            private=data.get("private", False),
            html_url=data.get("html_url", ""),
            clone_url=data.get("clone_url", ""),
            stars=data.get("stargazers_count", 0),
            language=data.get("language"),
            description=data.get("description"),
            updated_at=data.get("updated_at"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serializa a dict — usado por repos.py para el output JSON/render."""
        return {
            "id": self.id,
            "name": self.name,
            "full_name": self.full_name,
            "private": self.private,
            "html_url": self.html_url,
            "clone_url": self.clone_url,
            "stars": self.stars,
            "language": self.language,
            "description": self.description,
            "updated_at": self.updated_at,
        }
