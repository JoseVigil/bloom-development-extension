"""
GitHub API Client
Handles authenticated requests to GitHub REST API.
"""

import requests
from typing import Optional, List, Dict, Any
from brain.core.github.models import Repository


class GitHubAPIClient:
    """
    GitHub API v3 client with authentication.
    
    Handles rate limiting, pagination, and error responses.
    """
    
    BASE_URL = "https://api.github.com"
    
    def __init__(self, token: Optional[str] = None):
        """
        Initialize GitHub API client.
        
        Args:
            token: Personal access token. If None, tries to load from credentials.
        """
        if token is None:
            from brain.shared.credentials import GitHubCredentials
            creds = GitHubCredentials()
            token = creds.get_token()
        
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Bloom-Brain-CLI"
        })
    
    def get_current_user(self) -> Dict[str, Any]:
        """
        Get authenticated user info.
        
        Returns:
            User data dict
            
        Raises:
            requests.HTTPError: If request fails
        """
        response = self.session.get(f"{self.BASE_URL}/user")
        response.raise_for_status()
        return response.json()
    
    def get_user_orgs(self) -> List[Dict[str, Any]]:
        """
        Get user's organizations.
        
        Returns:
            List of organization dicts
        """
        response = self.session.get(f"{self.BASE_URL}/user/orgs")
        response.raise_for_status()
        return response.json()
    
    def get_user_repos(
        self,
        per_page: int = 100,
        sort: str = "updated"
    ) -> List[Repository]:
        """
        Get authenticated user's repositories.
        
        Args:
            per_page: Results per page (max 100)
            sort: Sort by (created, updated, pushed, full_name)
            
        Returns:
            List of Repository objects
        """
        response = self.session.get(
            f"{self.BASE_URL}/user/repos",
            params={
                "per_page": per_page,
                "sort": sort
            }
        )
        response.raise_for_status()
        return [Repository.from_dict(repo) for repo in response.json()]
    
    def get_org_repos(
        self,
        org: str,
        per_page: int = 100,
        sort: str = "updated"
    ) -> List[Repository]:
        """
        Get organization repositories.
        
        Args:
            org: Organization name
            per_page: Results per page (max 100)
            sort: Sort by (created, updated, pushed, full_name)
            
        Returns:
            List of Repository objects
        """
        response = self.session.get(
            f"{self.BASE_URL}/orgs/{org}/repos",
            params={
                "per_page": per_page,
                "sort": sort
            }
        )
        response.raise_for_status()
        return [Repository.from_dict(repo) for repo in response.json()]
    
    def get_repo(self, owner: str, repo: str) -> Repository:
        """
        Get repository details.
        
        Args:
            owner: Repository owner
            repo: Repository name
            
        Returns:
            Repository object
        """
        response = self.session.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
        response.raise_for_status()
        return Repository.from_dict(response.json())
    
    def repo_exists(self, owner: str, repo: str) -> bool:
        """
        Check if repository exists and is accessible.
        
        Args:
            owner: Repository owner
            repo: Repository name
            
        Returns:
            True if exists and accessible
        """
        try:
            response = self.session.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
            return response.status_code == 200
        except requests.RequestException:
            return False
    
    def create_repo(
        self,
        name: str,
        description: Optional[str] = None,
        private: bool = False,
        auto_init: bool = True,
        org: Optional[str] = None
    ) -> Repository:
        """
        Create new repository.
        
        Args:
            name: Repository name
            description: Repository description
            private: Make repository private
            auto_init: Initialize with README
            org: Organization name (if creating org repo)
            
        Returns:
            Created Repository object
        """
        url = f"{self.BASE_URL}/orgs/{org}/repos" if org else f"{self.BASE_URL}/user/repos"
        
        payload = {
            "name": name,
            "description": description,
            "private": private,
            "auto_init": auto_init
        }
        
        response = self.session.post(url, json=payload)
        response.raise_for_status()
        return Repository.from_dict(response.json())