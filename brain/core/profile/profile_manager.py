"""
Profile management for Bloom Nucleus.
Coordinates profile operations using specialized components.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, List, Any, Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ProfileManager:
    """
    Manages Chrome profiles with Bloom extension.
    Delegates specialized operations to dedicated components.
    """

    def __init__(self):
        """
        Initialize ProfileManager.
        Automatically creates PathResolver instance.
        """
        from brain.core.profile.path_resolver import PathResolver
        
        self.path_resolver = PathResolver()
        
        # Initialize specialized components (lazy import to avoid circular deps)
        from brain.core.profile.profile_create import ProfileCreator
        from brain.core.profile.profile_launcher import ProfileLauncher
        
        self.creator = ProfileCreator(self.path_resolver)
        self.launcher = ProfileLauncher(self.path_resolver, chrome_resolver=None)
        
        logger.debug("🎯 ProfileManager initialized with specialized components")

    def create_profile(
        self,
        profile_id: Optional[str] = None,
        name: Optional[str] = None,
        master: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new Chrome profile with Bloom extension.
        
        Delegates to ProfileCreator component.

        Args:
            profile_id: Optional custom profile ID (generates UUID if None)
            name: Optional profile name (uses ID if None)
            master: Whether this is the master profile

        Returns:
            Dict containing profile creation results:
                - id: Profile identifier
                - name: Profile display name
                - profile_dir: Path to profile directory
                - extension_path: Path to extension
                - master: Whether it's master profile
                - created_at: Creation timestamp

        Raises:
            ValueError: If profile_id already exists
            FileNotFoundError: If master extension not found
            OSError: If directory/file operations fail
        """
        logger.info("🗂️ ProfileManager.create_profile() - delegating to ProfileCreator")
        return self.creator.create_profile(profile_id, name, master)

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
        logger.info("🚀 ProfileManager.launch_profile() - delegating to ProfileLauncher")
        
        # Get profile data
        profile = self.get_profile(profile_id)
        
        # Delegate to launcher
        return self.launcher.launch(profile, url, spec_data)

    def list_profiles(self) -> List[Dict[str, Any]]:
        """
        List all registered profiles.

        Returns:
            List of profile dictionaries, each containing:
                - id: Profile identifier
                - name: Profile display name
                - master: Whether it's the master profile
                - extension_path: Path to extension directory
                - profile_dir: Path to profile directory
                - created_at: Creation timestamp

        Raises:
            FileNotFoundError: If profiles.json doesn't exist
        """
        logger.info("📋 Listing all profiles")
        
        profiles_file = self.path_resolver.profiles_json
        if not profiles_file.exists():
            logger.warning("⚠️ profiles.json not found, returning empty list")
            return []

        try:
            with open(profiles_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            profiles = data.get('profiles', [])
            
            # Enrich with existence checks
            for profile in profiles:
                profile_dir = Path(profile['profile_dir'])
                extension_path = Path(profile['extension_path'])
                
                profile['profile_exists'] = profile_dir.exists()
                profile['extension_exists'] = extension_path.exists()
            
            logger.info(f"✅ Found {len(profiles)} profile(s)")
            return profiles
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse profiles.json: {e}")
            raise ValueError(f"Invalid JSON in profiles.json: {e}")

    def get_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Get details of a specific profile.
        
        Supports partial ID matching (prefix).

        Args:
            profile_id: Profile identifier (full UUID or prefix)

        Returns:
            Dict containing profile information

        Raises:
            ValueError: If profile not found or multiple matches
        """
        logger.info(f"🔍 Getting profile: {profile_id}")
        
        profiles = self.list_profiles()
        
        # Try exact match first
        profile = next((p for p in profiles if p['id'] == profile_id), None)
        
        if profile:
            logger.info(f"✅ Profile found (exact): {profile['name']}")
            return profile
        
        # Try prefix match
        matches = [p for p in profiles if p['id'].startswith(profile_id)]
        
        if len(matches) == 0:
            raise ValueError(f"Profile '{profile_id}' not found")
        
        if len(matches) > 1:
            ids = [f"{p['name']} ({p['id'][:8]})" for p in matches]
            raise ValueError(
                f"Ambiguous profile ID '{profile_id}'. Multiple matches:\n" +
                "\n".join(f"  - {id}" for id in ids)
            )
        
        profile = matches[0]
        logger.info(f"✅ Profile found (prefix): {profile['name']}")
        return profile

    def delete_profile(self, profile_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Delete a profile and its associated files.

        Args:
            profile_id: Profile identifier to delete (full or prefix)
            force: Allow deletion of master profile

        Returns:
            Dict containing deletion results with keys:
                - profile_id: Deleted profile ID
                - removed_directory: Path to removed directory
                - was_master: Whether it was master profile

        Raises:
            ValueError: If trying to delete master without force flag
            FileNotFoundError: If profile doesn't exist
        """
        logger.info(f"🗑️ Deleting profile: {profile_id}")
        
        # Get profile info (supports prefix matching)
        profile = self.get_profile(profile_id)
        full_id = profile['id']
        
        # Check if master
        if profile.get('master') and not force:
            raise ValueError(
                f"Cannot delete master profile '{profile['name']}' without --force flag"
            )
        
        # Remove profile directory
        profile_dir = Path(profile['profile_dir'])
        if profile_dir.exists():
            shutil.rmtree(profile_dir)
            logger.info(f"🗂️ Removed directory: {profile_dir}")
        else:
            logger.warning(f"⚠️ Profile directory not found: {profile_dir}")
        
        # Remove from profiles.json
        profiles_file = self.path_resolver.profiles_json
        with open(profiles_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        data['profiles'] = [p for p in data['profiles'] if p['id'] != full_id]
        
        with open(profiles_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"✅ Profile '{profile['name']}' deleted successfully")
        
        return {
            "profile_id": full_id,
            "removed_directory": str(profile_dir),
            "was_master": profile.get('master', False)
        }

    def set_master_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Set a profile as the master profile.

        Args:
            profile_id: Profile identifier to set as master (full or prefix)

        Returns:
            Dict containing operation results with keys:
                - new_master_id: ID of new master profile
                - previous_master_id: ID of previous master (if any)

        Raises:
            ValueError: If profile doesn't exist
        """
        logger.info(f"👑 Setting master profile: {profile_id}")
        
        # Verify profile exists (supports prefix)
        profile = self.get_profile(profile_id)
        full_id = profile['id']
        
        # Load profiles.json
        profiles_file = self.path_resolver.profiles_json
        with open(profiles_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Find previous master
        previous_master = next((p for p in data['profiles'] if p.get('master')), None)
        previous_master_id = previous_master['id'] if previous_master else None
        
        # Update master flags
        for p in data['profiles']:
            p['master'] = (p['id'] == full_id)
        
        # Save changes
        with open(profiles_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"✅ Master profile set to '{profile['name']}'")
        
        return {
            "new_master_id": full_id,
            "previous_master_id": previous_master_id
        }

    def get_master_profile(self) -> Dict[str, Any]:
        """
        Get the current master profile.

        Returns:
            Dict containing master profile information

        Raises:
            ValueError: If no master profile is set
        """
        logger.info("👑 Getting master profile")
        
        profiles = self.list_profiles()
        master = next((p for p in profiles if p.get('master')), None)
        
        if not master:
            raise ValueError("No master profile configured")
        
        logger.info(f"✅ Master profile: {master['name']}")
        return master