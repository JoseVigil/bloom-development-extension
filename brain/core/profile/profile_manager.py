"""
Profile Manager Core - Central orchestration for Chrome Worker profiles.
Maintains registry integrity and coordinates creation, launching, and accounts.
"""

import shutil
import json
from typing import List, Dict, Any, Optional
from brain.core.profile.path_resolver import PathResolver
from brain.core.profile.profile_create import ProfileCreator
from brain.core.profile.profile_launcher import ProfileLauncher
from brain.core.profile.profile_accounts import ProfileAccountManager

class ProfileManager:
    """
    Facade for profile management operations.
    Delegates specialized tasks to Creator, Launcher, and AccountManager.
    """

    def __init__(self):
        """Initialize PathResolver and specialized sub-managers."""
        self.paths = PathResolver()
        self.creator = ProfileCreator(self.paths)
        self.launcher = ProfileLauncher(self.paths, None)
        self.accounts = ProfileAccountManager(self.paths)

    def list_profiles(self) -> List[Dict[str, Any]]:
        """
        Lists all existing Worker profiles with status and account info.

        Returns:
            List of dictionaries containing profile metadata and existence status.
        """
        if not self.paths.profiles_json.exists():
            return []
            
        with open(self.paths.profiles_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
            profiles = data.get('profiles', [])
            
            for p in profiles:
                p_dir = self.paths.profiles_dir / p['id']
                p['exists'] = p_dir.exists()
                p['alias'] = p.get('name', p.get('alias', 'N/A'))
                p['master_profile'] = p.get('master', False)
                p['linked_account'] = p.get('linked_account', None)
            return profiles

    def launch_profile(
        self, 
        profile_id: str, 
        url: Optional[str] = None,
        spec_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Launch Chrome with specified profile.
        
        Delegates to ProfileLauncher component.

        Args:
            profile_id: Profile identifier to launch
            url: DEPRECATED - use spec_data
            spec_data: Launch specification (REQUIRED)

        Returns:
            Dict containing launch results

        Raises:
            ValueError: If profile doesn't exist or spec missing
            FileNotFoundError: If Chrome executable not found
        """
        profiles = self.list_profiles()
        profile = next((p for p in profiles if p['id'] == profile_id), None)
        if not profile:
            raise ValueError(f"Profile {profile_id} not found")
        
        return self.launcher.launch(profile, spec_data=spec_data)

    def create_profile(self, name: str, master: bool = False) -> Dict[str, Any]:
        """
        Creates a new isolated Chrome profile.

        Delegates to ProfileCreator.

        Args:
            name: Descriptive alias for the profile.
            master: Whether to mark this as a master template profile.

        Returns:
            Metadata of the newly created profile.
        """
        data = self.creator.create_profile(name=name, master=master)
        return {
            "id": data['id'],
            "alias": data['name'],
            "path": data['profile_dir'],
            "master_profile": data['master']
        }

    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Permanently deletes a profile and its associated data.

        Args:
            profile_id: Identifier of the profile to destroy.

        Returns:
            Operation confirmation status.
        """
        # 1. Registry removal
        profiles = self.list_profiles()
        updated_profiles = [p for p in profiles if p['id'] != profile_id]
        
        with open(self.paths.profiles_json, 'w', encoding='utf-8') as f:
            json.dump({"profiles": updated_profiles}, f, indent=2, ensure_ascii=False)

        # 2. Filesystem cleanup
        profile_dir = self.paths.profiles_dir / profile_id
        if profile_dir.exists():
            shutil.rmtree(profile_dir)
            
        return {"profile_id": profile_id, "status": "destroyed"}

    # --- Delegated Account Methods (Maintaining original Docstrings) ---

    def link_account(self, profile_id: str, email: str) -> Dict[str, Any]:
        """Links a primary email account to a profile."""
        return self.accounts.link_account(profile_id, email)

    def unlink_account(self, profile_id: str) -> Dict[str, Any]:
        """Removes the primary email link from a profile."""
        return self.accounts.unlink_account(profile_id)

    def register_account(self, profile_id: str, provider: str, email: str) -> Dict[str, Any]:
        """Registers a service provider account to a profile."""
        return self.accounts.register_account(profile_id, provider, email)

    def remove_account(self, profile_id: str, provider: str) -> Dict[str, Any]:
        """Removes a service provider from a profile."""
        return self.accounts.remove_account(profile_id, provider)