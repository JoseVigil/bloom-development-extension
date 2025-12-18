"""
GitHub API Client
Handles all interactions with GitHub REST API.
"""

import requests
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


@dataclass
class GitHubRepo:
    """GitHub repository model."""
    id: int
    name: str
    full_name: str
    description: Optional[str]
    clone_url: str
    html_url: str
    private: bool
    language: Optional[str]
    stargazers_count: int
    updated_at: str
    
    @classmethod
    def from_api(cls, data: dict) -> "GitHubRepo":
        """Create from API response."""
        return cls(
            id=data["id"],
            name=data["name"],
            full_name=data["full_name"],
            description=data.get("description"),
            clone_url=data["clone_url"],
            html_url=data["html_url"],
            private=data["private"],
            language=data.get("language"),
            stargazers_count=data.get("stargazers_count", 0),
            updated_at=data["updated_at"]
        )
    
    def to_dict(self) -> dict:
        """Convert to dict for JSON output."""
        return {
            "id": self.id,
            "name": self.name,
            "full_name": self.full_name,
            "description": self.description,
            "clone_url": self.clone_url,
            "html_url": self.html_url,
            "private": self.private,
            "language": self.language,
            "stars": self.stargazers_count,
            "updated_at": self.updated_at
        }


@dataclass
class GitHubOrg:
    """GitHub organization model."""
    id: int
    login: str
    avatar_url: str
    description: Optional[str]
    
    @classmethod
    def from_api(cls, data: dict) -> "GitHubOrg":
        """Create from API response."""
        return cls(
            id=data["id"],
            login=data["login"],
            avatar_url=data["avatar_url"],
            description=data.get("description")
        )
    
    def to_dict(self) -> dict:
        """Convert to dict for JSON output."""
        return {
            "id": self.id,
            "login": self.login,
            "avatar_url": self.avatar_url,
            "description": self.description
        }


class GitHubAPIClient:
    """
    GitHub REST API v3 client.
    
    Pure business logic - no prints, no inputs.
    Raises exceptions on errors.
    """
    
    BASE_URL = "https://api.github.com"
    
    def __init__(self, token: Optional[str] = None):
        """
        Initialize client.
        
        Args:
            token: GitHub token. If None, will try to get from credentials.
        """
        if token is None:
            from brain.core.github.credentials import GitHubCredentials
            creds = GitHubCredentials()
            token = creds.get_token()
        
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28"
        })
    
    def _request(
        self, 
        method: str, 
        endpoint: str, 
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make API request.
        
        Args:
            method: HTTP method
            endpoint: API endpoint (without base URL)
            **kwargs: Additional request parameters
            
        Returns:
            API response as dict
            
        Raises:
            requests.HTTPError: On API errors
        """
        url = f"{self.BASE_URL}/{endpoint.lstrip('/')}"
        response = self.session.request(method, url, **kwargs)
        
        if not response.ok:
            error_msg = f"GitHub API error: {response.status_code}"
            try:
                error_data = response.json()
                if "message" in error_data:
                    error_msg = f"{error_msg} - {error_data['message']}"
            except Exception:
                error_msg = f"{error_msg} - {response.text}"
            
            raise requests.HTTPError(error_msg, response=response)
        
        return response.json()
    
    def get_current_user(self) -> Dict[str, Any]:
        """
        Get authenticated user information.
        
        Returns:
            User data dict
        """
        user = self._request("GET", "/user")
        
        # Get primary email if not in user object
        if not user.get("email"):
            try:
                emails = self._request("GET", "/user/emails")
                primary = next(
                    (e for e in emails if e.get("primary") and e.get("verified")),
                    None
                )
                if primary:
                    user["email"] = primary["email"]
            except Exception:
                pass  # Email is optional
        
        return user
    
    def get_user_orgs(self) -> List[Dict[str, Any]]:
        """
        Get user's organizations.
        
        Returns:
            List of organization dicts
        """
        return self._request("GET", "/user/orgs")
    
    def get_org_repos(
        self, 
        org: str, 
        per_page: int = 100,
        sort: str = "updated"
    ) -> List[GitHubRepo]:
        """
        Get organization repositories.
        
        Args:
            org: Organization login name
            per_page: Results per page (max 100)
            sort: Sort by (created, updated, pushed, full_name)
            
        Returns:
            List of GitHubRepo objects
        """
        repos_data = self._request(
            "GET",
            f"/orgs/{org}/repos",
            params={"per_page": per_page, "sort": sort}
        )
        return [GitHubRepo.from_api(r) for r in repos_data]
    
    def get_user_repos(
        self,
        per_page: int = 100,
        sort: str = "updated"
    ) -> List[GitHubRepo]:
        """
        Get authenticated user's repositories.
        
        Args:
            per_page: Results per page (max 100)
            sort: Sort by (created, updated, pushed, full_name)
            
        Returns:
            List of GitHubRepo objects
        """
        repos_data = self._request(
            "GET",
            "/user/repos",
            params={
                "per_page": per_page,
                "sort": sort,
                "affiliation": "owner"
            }
        )
        return [GitHubRepo.from_api(r) for r in repos_data]
    
    def get_repo(self, owner: str, repo: str) -> GitHubRepo:
        """
        Get specific repository.
        
        Args:
            owner: Repository owner
            repo: Repository name
            
        Returns:
            GitHubRepo object
        """
        repo_data = self._request("GET", f"/repos/{owner}/{repo}")
        return GitHubRepo.from_api(repo_data)
    
    def create_repo(
        self,
        name: str,
        description: Optional[str] = None,
        private: bool = False,
        auto_init: bool = True,
        org: Optional[str] = None
    ) -> GitHubRepo:
        """
        Create new repository.
        
        Args:
            name: Repository name
            description: Repository description
            private: Make repository private
            auto_init: Initialize with README
            org: Organization name (if creating in org)
            
        Returns:
            Created GitHubRepo object
        """
        payload = {
            "name": name,
            "description": description,
            "private": private,
            "auto_init": auto_init
        }
        
        endpoint = f"/orgs/{org}/repos" if org else "/user/repos"
        repo_data = self._request("POST", endpoint, json=payload)
        
        return GitHubRepo.from_api(repo_data)
    
    def repo_exists(self, owner: str, repo: str) -> bool:
        """
        Check if repository exists.
        
        Args:
            owner: Repository owner
            repo: Repository name
            
        Returns:
            True if exists, False otherwise
        """
        try:
            self.get_repo(owner, repo)
            return True
        except requests.HTTPError:
            return False