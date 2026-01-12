"""
Profile Store - JSON persistence and orphaned profile recovery.
Manages profiles.json and filesystem synchronization.
"""

import json
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ProfileStore:
    """Handles profile persistence and recovery."""
    
    def __init__(self, profiles_json: Path, profiles_dir: Path):
        logger.info("🔧 Initializing ProfileStore...")
        logger.debug(f"  profiles.json: {profiles_json}")
        logger.debug(f"  profiles dir: {profiles_dir}")
        
        self.profiles_json = profiles_json
        self.profiles_dir = profiles_dir
        
        if not self.profiles_json.exists():
            logger.info("📝 profiles.json not found, creating empty file...")
            self.save([])
        else:
            logger.debug(f"✅ profiles.json exists")
        
        logger.info("🔍 Checking for orphaned profiles...")
        orphans = self.auto_recover_orphans()
        
        if orphans:
            logger.info(f"✅ Recovered {len(orphans)} orphaned profile(s)")
        else:
            logger.debug("No orphaned profiles found")
    
    def load(self) -> List[Dict[str, Any]]:
        """Loads profiles from JSON file."""
        try:
            logger.debug(f"📖 Loading profiles from {self.profiles_json}")
            with open(self.profiles_json, 'r', encoding='utf-8') as f:
                profiles = json.load(f)
            
            logger.debug(f"✅ Loaded {len(profiles)} profile(s)")
            return profiles
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON in profiles.json: {e}")
            return []
        except FileNotFoundError:
            logger.warning("⚠️ profiles.json not found, returning empty list")
            return []
        except Exception as e:
            logger.error(f"❌ Unexpected error loading profiles: {e}", exc_info=True)
            return []
    
    def save(self, profiles: List[Dict[str, Any]]) -> None:
        """Saves profiles to JSON file."""
        try:
            logger.debug(f"💾 Saving {len(profiles)} profile(s) to {self.profiles_json}")
            
            with open(self.profiles_json, 'w', encoding='utf-8') as f:
                json.dump(profiles, f, indent=2, ensure_ascii=False)
            
            logger.debug("✅ Profiles saved successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to save profiles: {e}", exc_info=True)
            raise
    
    def find(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """
        Finds a profile by ID or partial ID.
        
        Args:
            profile_id: Full UUID or prefix (e.g., 'abc12345')
            
        Returns:
            Profile dict or None
        """
        logger.debug(f"🔍 Searching for profile: {profile_id}")
        profiles = self.load()
        
        # Exact match
        for p in profiles:
            if p.get('id') == profile_id:
                logger.debug(f"✅ Found exact match: {p.get('alias', 'unnamed')}")
                return p
        
        # Prefix match
        matches = []
        for p in profiles:
            if p.get('id', '').startswith(profile_id):
                matches.append(p)
        
        if len(matches) == 1:
            logger.debug(f"✅ Found prefix match: {matches[0].get('alias', 'unnamed')}")
            return matches[0]
        elif len(matches) > 1:
            logger.warning(f"⚠️ Multiple profiles match prefix '{profile_id}': {[p.get('alias') for p in matches]}")
            return matches[0]
        
        logger.debug(f"❌ No profile found matching: {profile_id}")
        return None
    
    def add(self, profile: Dict[str, Any]) -> None:
        """Adds a new profile to the store."""
        profile_id = profile.get('id', 'unknown')
        alias = profile.get('alias', 'unnamed')
        
        logger.info(f"➕ Adding profile: {alias} ({profile_id[:8]}...)")
        
        profiles = self.load()
        profiles.append(profile)
        self.save(profiles)
        
        logger.debug(f"✅ Profile added successfully")
    
    def remove(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """
        Removes a profile from the store.
        
        Args:
            profile_id: Full UUID or prefix
            
        Returns:
            Removed profile dict or None
        """
        logger.info(f"🗑️ Removing profile: {profile_id}")
        
        profiles = self.load()
        found = None
        updated = []
        
        for p in profiles:
            if p['id'] == profile_id or p['id'].startswith(profile_id):
                found = p
                logger.debug(f"  Found: {p.get('alias', 'unnamed')} ({p['id'][:8]}...)")
            else:
                updated.append(p)
        
        if found:
            self.save(updated)
            logger.info(f"✅ Profile removed: {found.get('alias', 'unnamed')}")
        else:
            logger.warning(f"⚠️ Profile not found: {profile_id}")
        
        return found
    
    def update(self, profile_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Updates a profile's fields.
        
        Args:
            profile_id: Full UUID or prefix
            updates: Dict of fields to update
            
        Returns:
            Updated profile dict or None
        """
        logger.info(f"📝 Updating profile: {profile_id}")
        logger.debug(f"  Updates: {updates}")
        
        profiles = self.load()
        found = None
        
        for p in profiles:
            if p['id'] == profile_id or p['id'].startswith(profile_id):
                old_alias = p.get('alias', 'unnamed')
                p.update(updates)
                found = p
                
                new_alias = p.get('alias', 'unnamed')
                if old_alias != new_alias:
                    logger.debug(f"  Alias changed: '{old_alias}' → '{new_alias}'")
                
                break
        
        if found:
            self.save(profiles)
            logger.info(f"✅ Profile updated: {found.get('alias', 'unnamed')}")
        else:
            logger.warning(f"⚠️ Profile not found: {profile_id}")
        
        return found
    
    def auto_recover_orphans(self) -> List[Dict[str, Any]]:
        """
        Recovers profiles with filesystem directories but no JSON entry.
        
        Returns:
            List of recovered profiles
        """
        if not self.profiles_dir.exists():
            logger.debug(f"Profiles directory doesn't exist: {self.profiles_dir}")
            return []
        
        logger.debug("🔍 Scanning for orphaned profile directories...")
        
        profiles = self.load()
        registered_ids = {p['id'] for p in profiles}
        
        physical_folders = [f for f in self.profiles_dir.iterdir() if f.is_dir()]
        logger.debug(f"  Found {len(physical_folders)} physical directories")
        logger.debug(f"  Registered profiles: {len(registered_ids)}")
        
        orphaned = []
        
        for folder in physical_folders:
            folder_id = folder.name
            
            # Validate UUID format
            try:
                uuid.UUID(folder_id)
            except ValueError:
                logger.debug(f"  ✗ Skipping invalid UUID: {folder_id}")
                continue
            
            if folder_id not in registered_ids:
                logger.info(f"  🔄 Found orphaned profile: {folder_id[:8]}...")
                
                alias = self._recover_alias(folder) or f"Recovered-{folder_id[:8]}"
                created_at = datetime.fromtimestamp(folder.stat().st_ctime).isoformat()
                
                recovered = {
                    "id": folder_id,
                    "alias": alias,
                    "created_at": created_at,
                    "linked_account": None,
                    "recovered": True
                }
                
                logger.debug(f"    Recovered alias: {alias}")
                orphaned.append(recovered)
        
        if orphaned:
            logger.info(f"💾 Saving {len(orphaned)} recovered profile(s)...")
            profiles.extend(orphaned)
            self.save(profiles)
        
        return orphaned
    
    def _recover_alias(self, folder: Path) -> Optional[str]:
        """Attempts to recover alias from landing manifest."""
        manifest_path = folder / "landing" / "manifest.json"
        
        if not manifest_path.exists():
            logger.debug(f"  No landing manifest found: {manifest_path}")
            return None
        
        try:
            logger.debug(f"  📖 Reading landing manifest: {manifest_path}")
            with open(manifest_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                alias = data.get('profile', {}).get('alias')
                
                if alias:
                    logger.debug(f"    ✅ Recovered alias from manifest: {alias}")
                    return alias
                else:
                    logger.debug(f"    ⚠️ No alias found in manifest")
                    return None
                    
        except json.JSONDecodeError as e:
            logger.warning(f"  ⚠️ Invalid JSON in landing manifest: {e}")
            return None
        except Exception as e:
            logger.warning(f"  ⚠️ Failed to read landing manifest: {e}")
            return None