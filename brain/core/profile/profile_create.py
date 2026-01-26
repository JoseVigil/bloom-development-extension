"""
Profile creation logic for Bloom Nucleus.
Handles all profile creation operations including directory setup,
extension copying, page generation, and profiles.json registration.
"""

import json
import shutil
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ProfileCreator:
    """
    Handles profile creation operations.
    Separated from ProfileManager to maintain single responsibility.
    """

    def __init__(self, path_resolver):
        """
        Initialize ProfileCreator.

        Args:
            path_resolver: PathResolver instance for directory resolution
        """
        self.path_resolver = path_resolver
        logger.debug("🗂️ ProfileCreator initialized")

    def create_profile(
        self,
        profile_id: Optional[str] = None,
        name: Optional[str] = None,
        master: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new Chrome profile with Bloom extension.

        Args:
            profile_id: Optional custom profile ID (generates UUID if None)
            name: Optional profile name (uses ID if None)
            master: Whether this is the master profile

        Returns:
            Dict containing profile creation results with keys:
                - id: The profile identifier
                - name: Profile display name
                - profile_dir: Path to profile directory
                - extension_path: Path to copied extension
                - master: Whether it's master profile
                - created_at: ISO timestamp

        Raises:
            ValueError: If profile_id already exists
            FileNotFoundError: If master extension not found
            OSError: If directory/file operations fail
        """
        logger.info("🚀 Starting profile creation...")

        # 1. Generate or validate profile_id
        if profile_id is None:
            profile_id = self._generate_unique_id()
            logger.info(f"🔑 Generated profile ID: {profile_id}")
        else:
            # Validate uniqueness
            if self._profile_exists(profile_id):
                raise ValueError(f"Profile ID '{profile_id}' already exists")

        # 2. Set profile name
        profile_name = name if name else f"Profile-{profile_id[:8]}"
        logger.info(f"🏷️ Profile name: {profile_name}")

        # 3. Create profile directory structure
        profile_dir = self._ensure_profile_directory(profile_id)
        logger.info(f"📁 Profile directory created: {profile_dir}")

        # 4. Copy extension to profile (FIXED: usa "extension" no "BloomExtension")
        extension_path = self._copy_extension_to_profile(profile_id, master)
        logger.info(f"🧩 Extension copied to: {extension_path}")

        # 5. Generate discovery and landing pages
        self._generate_profile_pages(profile_id, profile_name)
        logger.info(f"📄 Discovery/Landing pages generated")

        # 6. Build profile data
        profile_data = {
            "id": profile_id,
            "name": profile_name,
            "profile_dir": str(profile_dir),
            "extension_path": str(extension_path),
            "master": master,
            "created_at": datetime.now().isoformat()
        }

        # 7. Register in profiles.json
        self._register_profile(profile_data)
        logger.info(f"📝 Profile registered in profiles.json")

        logger.info(f"✅ Profile '{profile_id}' created successfully")
        return profile_data

    def _generate_unique_id(self) -> str:
        """Generate a unique profile ID."""
        unique_id = str(uuid.uuid4())
        logger.debug(f"🔐 Generated UUID: {unique_id}")
        return unique_id

    def _profile_exists(self, profile_id: str) -> bool:
        """Check if profile already exists in profiles.json."""
        profiles_file = self.path_resolver.profiles_json
        if not profiles_file.exists():
            return False
        
        try:
            with open(profiles_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                existing_ids = [p['id'] for p in data.get('profiles', [])]
                return profile_id in existing_ids
        except Exception as e:
            logger.warning(f"⚠️ Error checking profile existence: {e}")
            return False

    def _ensure_profile_directory(self, profile_id: str) -> Path:
        """
        Create profile directory structure.

        Args:
            profile_id: Profile identifier

        Returns:
            Path: Created profile directory

        Raises:
            OSError: If directory creation fails
        """
        profile_dir = self.path_resolver.profiles_dir / profile_id
        
        try:
            profile_dir.mkdir(parents=True, exist_ok=True)
            logger.debug(f"📂 Created directory: {profile_dir}")
            return profile_dir
        except OSError as e:
            logger.error(f"❌ Failed to create profile directory: {e}")
            raise

    def _copy_extension_to_profile(self, profile_id: str, is_master: bool) -> Path:
        """
        Copy extension to profile directory.

        FIXED: Copia a "extension" (no "BloomExtension")
        
        For master profile: Uses base extension from bin/extension
        For regular profiles: Uses master profile's extension as template

        Args:
            profile_id: Profile identifier
            is_master: Whether this is the master profile

        Returns:
            Path: Destination extension directory

        Raises:
            FileNotFoundError: If source extension not found
            OSError: If copy operation fails
        """
        profile_dir = self.path_resolver.profiles_dir / profile_id
        dest_extension = profile_dir / "extension"  # ✅ FIXED: era "BloomExtension"

        if is_master:
            # Master profile: use base extension from bin/extension
            source_extension = self.path_resolver.base_dir / "bin" / "extension"
            logger.info(f"🎯 Master profile - using base extension: {source_extension}")
            
            if not source_extension.exists():
                raise FileNotFoundError(
                    f"Base extension not found at: {source_extension}\n"
                    f"Expected structure: BloomNucleus/bin/extension/"
                )
        else:
            # Regular profile: copy from master profile's extension
            logger.info("📋 Regular profile - copying from master profile")
            
            try:
                master_profile = self._get_master_profile()
                master_id = master_profile['id']
                source_extension = self.path_resolver.profiles_dir / master_id / "extension"
                logger.info(f"📂 Using master profile '{master_id}' extension as template")
                
            except ValueError as e:
                raise ValueError(
                    f"Cannot create regular profile: {e}\n"
                    f"You must create a master profile first."
                )

        # Verify source exists
        if not source_extension.exists():
            raise FileNotFoundError(f"Source extension not found: {source_extension}")

        # Copy extension
        try:
            if dest_extension.exists():
                shutil.rmtree(dest_extension)
                logger.debug(f"🗑️ Removed existing extension at {dest_extension}")
            
            shutil.copytree(source_extension, dest_extension)
            logger.info(f"✅ Extension copied successfully to {dest_extension}")
            return dest_extension
            
        except OSError as e:
            logger.error(f"❌ Failed to copy extension: {e}")
            raise

    def _generate_profile_pages(self, profile_id: str, profile_name: str) -> None:
        """
        Generate discovery and landing pages for the profile.
        
        Uses web generators to create HTML pages inside the extension directory.
        The generators handle directory creation and template copying internally.
        
        Args:
            profile_id: Profile identifier (UUID)
            profile_name: Profile display name
            
        Raises:
            ImportError: If page generators are not available
            Exception: If page generation fails critically
            
        Note:
            Page generation errors are logged but don't stop profile creation.
        """
        try:
            from brain.core.profile.web.discovery_generator import generate_discovery_page
            from brain.core.profile.web.landing_generator import generate_profile_landing
        except ImportError as e:
            logger.error(f"❌ Page generators not available: {e}")
            raise ImportError(f"Cannot import page generators: {e}")

        profile_dir = self.path_resolver.profiles_dir / profile_id
        extension_dir = profile_dir / "extension"

        # Verificar que extension_dir existe
        if not extension_dir.exists():
            raise FileNotFoundError(f"Extension directory not found: {extension_dir}")

        profile_data = {
            'id': profile_id,
            'alias': profile_name,
            'email': None,
            'register': True
        }

        # Generate discovery page
        try:
            generate_discovery_page(extension_dir, profile_data)
            logger.info(f"✅ Discovery page generated")
        except Exception as e:
            logger.error(f"❌ Failed to generate discovery page: {e}", exc_info=True)
            raise Exception(f"Discovery page generation failed: {e}")

        # Generate landing page
        try:
            generate_profile_landing(extension_dir, profile_data)
            logger.info(f"✅ Landing page generated")
            
            # ✅ VERIFICAR que la carpeta landing/ se creó
            landing_dir = extension_dir / "landing"
            if not landing_dir.exists():
                raise FileNotFoundError(f"Landing directory was not created at {landing_dir}")
            
            logger.info(f"✅ Landing directory verified at {landing_dir}")
            
        except Exception as e:
            logger.error(f"❌ Failed to generate landing page: {e}", exc_info=True)
            raise Exception(f"Landing page generation failed: {e}")

    def _get_master_profile(self) -> Dict[str, Any]:
        """
        Get master profile from profiles.json.
        
        Returns:
            Dict: Master profile data
            
        Raises:
            ValueError: If no master profile found
        """
        profiles_file = self.path_resolver.profiles_json
        if not profiles_file.exists():
            raise ValueError("profiles.json not found")
        
        with open(profiles_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            master = next((p for p in data.get('profiles', []) if p.get('master')), None)
            
            if not master:
                raise ValueError("No master profile found")
            
            return master

    def _register_profile(self, profile_data: Dict[str, Any]) -> None:
        """
        Register profile in profiles.json.
        
        Args:
            profile_data: Profile information to register
        """
        profiles_file = self.path_resolver.profiles_json
        
        # Load existing profiles or create new structure
        if profiles_file.exists():
            with open(profiles_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            data = {"profiles": []}
        
        # Add new profile
        data['profiles'].append(profile_data)
        
        # Save back to file
        profiles_file.parent.mkdir(parents=True, exist_ok=True)
        with open(profiles_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        logger.debug(f"✅ Profile registered in {profiles_file}")