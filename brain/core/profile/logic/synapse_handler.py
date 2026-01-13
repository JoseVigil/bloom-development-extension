"""
Synapse Bridge Handler - Registry, Native Manifests, and Extension Config.
Manages per-profile Native Messaging Host configuration.
"""

import json
import platform
from pathlib import Path
from typing import Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class SynapseHandler:
    """Handles Synapse bridge configuration for profiles."""
    
    def __init__(self, base_dir: Path, extension_id: str):
        logger.info("🔧 Initializing SynapseHandler...")
        logger.debug(f"  Base dir: {base_dir}")
        logger.debug(f"  Extension ID: {extension_id}")
        
        self.base_dir = base_dir
        self.extension_id = extension_id
        self.host_exe = base_dir / "bin" / "native" / "bloom-host.exe"
        
        logger.debug(f"  Host executable: {self.host_exe}")
        
        if not self.host_exe.exists():
            logger.warning(f"⚠️ Host executable not found: {self.host_exe}")
        else:
            logger.debug("✅ Host executable exists")
    
    def provision_bridge(self, profile_id: str) -> str:
        """
        Provisions a unique Synapse bridge for a profile.
        Creates manifest in profiles/[UUID]/synapse/ and registers in HKCU.
        
        Args:
            profile_id: Full UUID of the profile
            
        Returns:
            bridge_name: e.g., 'com.bloom.synapse.abc12345'
        """
        short_id = profile_id[:8]
        bridge_name = f"com.bloom.synapse.{short_id}"
        
        logger.info(f"🌉 Provisioning bridge for profile: {short_id}...")
        logger.debug(f"  Full profile ID: {profile_id}")
        logger.debug(f"  Bridge name: {bridge_name}")
        
        # NUEVO: Synapse dir dentro del perfil
        synapse_dir = self.base_dir / "profiles" / profile_id / "synapse"
        if not synapse_dir.exists():
            logger.info(f"📁 Creating synapse directory: {synapse_dir}")
            synapse_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # 1. Create native manifest JSON
            logger.debug("📝 Creating native manifest...")
            manifest_path = self._create_native_manifest(bridge_name, profile_id, synapse_dir)
            logger.info(f"  ✅ Manifest created: {manifest_path}")
            
            # 2. Register in Windows Registry
            if platform.system() == "Windows":
                logger.debug("🪟 Registering in Windows Registry...")
                self._register_in_registry(bridge_name, manifest_path)
                logger.info("  ✅ Registry entry created")
            else:
                logger.debug(f"  ℹ️ Skipping registry (not Windows, system: {platform.system()})")
            
            logger.info(f"✅ Bridge provisioned successfully: {bridge_name}")
            return bridge_name
            
        except Exception as e:
            logger.error(f"❌ Failed to provision bridge: {e}", exc_info=True)
            raise
    
    def _create_native_manifest(self, bridge_name: str, profile_id: str, synapse_dir: Path) -> Path:
        """Creates the native messaging host JSON manifest."""
        manifest_path = synapse_dir / f"{bridge_name}.json"
        
        logger.debug(f"Creating manifest at: {manifest_path}")
        
        manifest_data = {
            "name": bridge_name,
            "description": f"Bloom Synapse Bridge for Profile {profile_id}",
            "path": str(self.host_exe.resolve()),
            "type": "stdio",
            "allowed_origins": [
                f"chrome-extension://{self.extension_id}/"
            ],
            "args": ["--profile-id", profile_id]
        }
        
        logger.debug(f"  Manifest data: {json.dumps(manifest_data, indent=2)}")
        
        try:
            with open(manifest_path, 'w', encoding='utf-8') as f:
                json.dump(manifest_data, f, indent=2)
            
            logger.debug(f"  ✅ Manifest file written successfully")
            return manifest_path
            
        except Exception as e:
            logger.error(f"  ❌ Failed to write manifest: {e}", exc_info=True)
            raise
    
    def _register_in_registry(self, bridge_name: str, manifest_path: Path) -> None:
        """Registers the bridge in Windows Registry (HKCU)."""
        try:
            import winreg
            logger.debug("  winreg module imported successfully")
        except ImportError as e:
            logger.warning(f"  ⚠️ winreg not available (not Windows?): {e}")
            return
        
        reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
        logger.debug(f"  Registry path: HKCU\\{reg_path}")
        logger.debug(f"  Manifest path: {manifest_path.resolve()}")
        
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path) as key:
                winreg.SetValueEx(
                    key, 
                    "", 
                    0, 
                    winreg.REG_SZ, 
                    str(manifest_path.resolve())
                )
            
            logger.debug("  ✅ Registry key created successfully")
            
        except Exception as e:
            logger.error(f"  ❌ Failed to register in registry: {e}", exc_info=True)
            raise RuntimeError(f"Failed to register bridge in Windows Registry: {e}")
    
    def inject_extension_config(self, profile_id: str, bridge_name: str) -> None:
        """
        Writes synapse.config.js to the profile's extension directory.
        
        Args:
            profile_id: Full UUID of the profile
            bridge_name: The bridge name to inject
        """
        logger.info(f"💉 Injecting extension config for profile: {profile_id[:8]}...")
        logger.debug(f"  Bridge name: {bridge_name}")
        
        extension_dir = self.base_dir / "profiles" / profile_id / "extension"
        config_path = extension_dir / "synapse.config.js"
        
        logger.debug(f"  Extension dir: {extension_dir}")
        logger.debug(f"  Config path: {config_path}")
        
        try:
            if not extension_dir.exists():
                logger.info(f"  📁 Creating extension directory: {extension_dir}")
                extension_dir.mkdir(parents=True, exist_ok=True)
            
            content = f"self.SYNAPSE_CONFIG = {{ bridge_name: '{bridge_name}' }};"
            logger.debug(f"  Config content: {content}")
            
            config_path.write_text(content, encoding='utf-8')
            
            logger.info(f"  ✅ Config injected: {config_path}")
            
        except Exception as e:
            logger.error(f"  ❌ Failed to inject config: {e}", exc_info=True)
            raise
    
    def cleanup_bridge(self, profile_id: str) -> None:
        """
        Removes bridge configuration for a profile.
        
        Args:
            profile_id: Full UUID of the profile
        """
        short_id = profile_id[:8]
        bridge_name = f"com.bloom.synapse.{short_id}"
        
        logger.info(f"🗑️ Cleaning up bridge for profile: {short_id}...")
        logger.debug(f"  Bridge name: {bridge_name}")
        
        # Remove manifest file from profile's synapse directory
        synapse_dir = self.base_dir / "profiles" / profile_id / "synapse"
        manifest_path = synapse_dir / f"{bridge_name}.json"
        
        if manifest_path.exists():
            try:
                logger.debug(f"  Removing manifest: {manifest_path}")
                manifest_path.unlink()
                logger.info("  ✅ Manifest file removed")
            except Exception as e:
                logger.error(f"  ❌ Failed to remove manifest: {e}", exc_info=True)
        else:
            logger.debug(f"  ℹ️ Manifest file doesn't exist: {manifest_path}")
        
        # Remove registry entry (Windows only)
        if platform.system() == "Windows":
            try:
                import winreg
                reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
                
                logger.debug(f"  Removing registry key: HKCU\\{reg_path}")
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, reg_path)
                logger.info("  ✅ Registry entry removed")
                
            except ImportError:
                logger.debug("  ℹ️ winreg not available (not Windows)")
            except FileNotFoundError:
                logger.debug("  ℹ️ Registry key doesn't exist")
            except OSError as e:
                logger.warning(f"  ⚠️ Failed to remove registry key: {e}")
        else:
            logger.debug(f"  ℹ️ Skipping registry cleanup (not Windows, system: {platform.system()})")
        
        logger.info(f"✅ Bridge cleanup completed for: {short_id}")