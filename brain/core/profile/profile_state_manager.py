"""
Profile Manager Core - Governor of States
Manages enriched runtime state in profiles.json with atomic write operations.
EXCLUSIVE authority over profile state persistence.
"""

import json
import uuid
import logging
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import tempfile
import shutil

try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except ImportError:
    AIOFILES_AVAILABLE = False

logger = logging.getLogger("brain.profile_manager")


class ProfileStateManager:
    """
    The Governor of States - Exclusive manager of profiles.json runtime state.
    
    Responsibilities:
    - Manage enriched runtime_state for profiles
    - Atomic file operations with temp file + replace pattern
    - Profile lifecycle state transitions (online/offline)
    - Heartbeat tracking
    
    State Schema:
    {
        "runtime_state": {
            "status": "open" | "closed",
            "pid": 1234,
            "launch_id": "uuid-launch",
            "last_heartbeat": "ISO-TIMESTAMP",
            "handshake_confirmed": true,
            "session_start": "ISO-TIMESTAMP"
        }
    }
    """
    
    def __init__(self, profiles_json_path: Path):
        """
        Initialize ProfileStateManager.
        
        Args:
            profiles_json_path: Path to profiles.json in config directory
        """
        self.profiles_json = profiles_json_path
        self.profiles_json.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize empty profiles file if doesn't exist
        if not self.profiles_json.exists():
            self._sync_write_profiles({"profiles": []})
        
        logger.info(f"🛡️ ProfileStateManager initialized: {self.profiles_json}")
    
    async def set_profile_online(
        self, 
        profile_id: str, 
        pid: int, 
        launch_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Mark profile as online with enriched runtime state.
        
        Args:
            profile_id: Profile identifier
            pid: Process ID of the Chrome instance
            launch_id: Optional launch identifier (generated if not provided)
            
        Returns:
            Updated profile state
        """
        if launch_id is None:
            launch_id = str(uuid.uuid4())
        
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        runtime_state = {
            "status": "open",
            "pid": pid,
            "launch_id": launch_id,
            "last_heartbeat": timestamp,
            "handshake_confirmed": False,
            "session_start": timestamp
        }
        
        await self._update_profile_state(profile_id, runtime_state)
        logger.info(f"✅ Profile {profile_id[:8]} set ONLINE (PID: {pid})")
        
        return runtime_state
    
    async def set_profile_offline(self, profile_id: str) -> Dict[str, Any]:
        """
        Mark profile as offline, clearing runtime state.
        
        Args:
            profile_id: Profile identifier
            
        Returns:
            Cleared runtime state
        """
        runtime_state = {
            "status": "closed",
            "pid": None,
            "launch_id": None,
            "last_heartbeat": None,
            "handshake_confirmed": False,
            "session_start": None
        }
        
        await self._update_profile_state(profile_id, runtime_state)
        logger.info(f"🔌 Profile {profile_id[:8]} set OFFLINE")
        
        return runtime_state
    
    async def confirm_handshake(self, profile_id: str) -> bool:
        """
        Mark handshake as confirmed after successful connection.
        
        Args:
            profile_id: Profile identifier
            
        Returns:
            True if successful, False if profile not found
        """
        profiles = await self._read_profiles()
        
        for profile in profiles.get('profiles', []):
            if profile.get('id') == profile_id:
                runtime_state = profile.get('runtime_state', {})
                runtime_state['handshake_confirmed'] = True
                runtime_state['last_heartbeat'] = datetime.utcnow().isoformat() + 'Z'
                
                await self._update_profile_state(profile_id, runtime_state)
                logger.info(f"🤝 Handshake confirmed for {profile_id[:8]}")
                return True
        
        logger.warning(f"⚠️ Profile {profile_id[:8]} not found for handshake confirmation")
        return False
    
    async def update_heartbeat(self, profile_id: str) -> bool:
        """
        Update last_heartbeat timestamp for profile.
        
        Args:
            profile_id: Profile identifier
            
        Returns:
            True if successful, False if profile not found
        """
        profiles = await self._read_profiles()
        
        for profile in profiles.get('profiles', []):
            if profile.get('id') == profile_id:
                runtime_state = profile.get('runtime_state', {})
                runtime_state['last_heartbeat'] = datetime.utcnow().isoformat() + 'Z'
                
                await self._update_profile_state(profile_id, runtime_state)
                logger.debug(f"💓 Heartbeat updated for {profile_id[:8]}")
                return True
        
        return False
    
    async def get_profile_state(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve current runtime state for a profile.
        
        Args:
            profile_id: Profile identifier
            
        Returns:
            Runtime state dictionary or None if not found
        """
        profiles = await self._read_profiles()
        
        for profile in profiles.get('profiles', []):
            if profile.get('id') == profile_id:
                return profile.get('runtime_state')
        
        return None
    
    async def _update_profile_state(self, profile_id: str, runtime_state: Dict[str, Any]):
        """
        Update runtime_state for specific profile with atomic write.
        
        Args:
            profile_id: Profile identifier
            runtime_state: New runtime state to set
        """
        profiles = await self._read_profiles()
        
        profile_found = False
        for profile in profiles.get('profiles', []):
            if profile.get('id') == profile_id:
                profile['runtime_state'] = runtime_state
                profile_found = True
                break
        
        if not profile_found:
            logger.warning(f"⚠️ Profile {profile_id[:8]} not found in registry")
            return
        
        await self._write_profiles_atomic(profiles)
    
    async def _read_profiles(self) -> Dict[str, Any]:
        """
        Read profiles.json safely.
        
        Returns:
            Profiles data structure
        """
        if AIOFILES_AVAILABLE:
            async with aiofiles.open(self.profiles_json, 'r', encoding='utf-8') as f:
                content = await f.read()
                return json.loads(content)
        else:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._sync_read_profiles)
    
    def _sync_read_profiles(self) -> Dict[str, Any]:
        """Synchronous fallback for reading profiles"""
        with open(self.profiles_json, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    async def _write_profiles_atomic(self, data: Dict[str, Any]):
        """
        Write profiles.json atomically using temp file + replace pattern.
        Prevents corruption if system crashes during write.
        
        Args:
            data: Complete profiles data structure to write
        """
        if AIOFILES_AVAILABLE:
            # Create temp file in same directory for atomic rename
            temp_fd, temp_path = tempfile.mkstemp(
                dir=self.profiles_json.parent,
                prefix='.profiles_',
                suffix='.tmp'
            )
            
            try:
                # Write to temp file
                async with aiofiles.open(temp_fd, 'w', encoding='utf-8', closefd=False) as f:
                    await f.write(json.dumps(data, indent=2, ensure_ascii=False))
                
                # Close file descriptor before rename
                import os
                os.close(temp_fd)
                
                # Atomic replace
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    shutil.move,
                    temp_path,
                    str(self.profiles_json)
                )
                
                logger.debug("💾 profiles.json written atomically")
                
            except Exception as e:
                # Cleanup temp file on error
                import os
                try:
                    os.close(temp_fd)
                except:
                    pass
                try:
                    Path(temp_path).unlink(missing_ok=True)
                except:
                    pass
                raise e
        else:
            # Fallback to executor for sync atomic write
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._sync_write_profiles,
                data
            )
    
    def _sync_write_profiles(self, data: Dict[str, Any]):
        """
        Synchronous atomic write fallback.
        Uses temp file + replace pattern.
        """
        temp_fd, temp_path = tempfile.mkstemp(
            dir=self.profiles_json.parent,
            prefix='.profiles_',
            suffix='.tmp'
        )
        
        try:
            with open(temp_fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # Atomic replace
            shutil.move(temp_path, str(self.profiles_json))
            logger.debug("💾 profiles.json written atomically (sync)")
            
        except Exception as e:
            # Cleanup on error
            try:
                Path(temp_path).unlink(missing_ok=True)
            except:
                pass
            raise e
