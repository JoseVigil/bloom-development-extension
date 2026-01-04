"""
Onboarding status manager - Pure business logic.
Aggregates status from multiple Brain subsystems.

FIXED:
- Safe imports with proper error handling
- Graceful fallbacks when modules don't exist
- Better error messages
"""

from typing import Dict, Any
from datetime import datetime
import importlib
import sys


class OnboardingStatusManager:
    """
    Manager for aggregating onboarding completion status.
    Checks GitHub auth, Gemini keys, Nucleus creation, and project additions.
    """
    
    def __init__(self, global_context=None):
        """
        Initialize onboarding status manager.
        
        Args:
            global_context: Optional GlobalContext for verbose logging
        """
        self.gc = global_context
        self.verbose = getattr(global_context, 'verbose', False)
    
    def check_onboarding_status(self, refresh: bool = False) -> Dict[str, Any]:
        """
        Check onboarding completion by aggregating multiple component checks.
        
        Args:
            refresh: If True, force re-check ignoring cache
            
        Returns:
            Dict with ready status, current_step, completion_percentage, and details
        """
        if self.verbose:
            print("🔍 Aggregating onboarding status...")
        
        # Check all onboarding components
        checks = {
            'github': self._check_github_auth(),
            'gemini': self._check_gemini_keys(),
            'nucleus': self._check_nucleus_exists(),
            'projects': self._check_projects_added()
        }
        
        # Calculate completion
        completed_steps = sum(1 for v in checks.values() if v.get('authenticated') or 
                                                             v.get('configured') or 
                                                             v.get('exists') or 
                                                             v.get('added', False))
        total_steps = len(checks)
        completion_percentage = int((completed_steps / total_steps) * 100)
        
        # Determine current step and readiness
        if not checks['github'].get('authenticated'):
            current_step = 'welcome'
            ready = False
        elif not checks['gemini'].get('configured'):
            current_step = 'gemini'
            ready = False
        elif not checks['nucleus'].get('exists'):
            current_step = 'nucleus'
            ready = False
        elif not checks['projects'].get('added'):
            current_step = 'projects'
            ready = False
        else:
            current_step = 'completed'
            ready = True
        
        return {
            'ready': ready,
            'current_step': current_step,
            'completed': ready,
            'completion_percentage': completion_percentage,
            'details': checks,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
    
    def _safe_import_module(self, module_path: str):
        """
        Safely import a module with proper error handling.
        
        Args:
            module_path: Full module path (e.g., 'brain.core.github.auth_manager')
            
        Returns:
            Module object or None if import fails
        """
        try:
            if self.verbose:
                print(f"  📦 Importing {module_path}...")
            
            module = importlib.import_module(module_path)
            
            if self.verbose:
                print(f"  ✅ Successfully imported {module_path}")
            
            return module
        except ModuleNotFoundError as e:
            if self.verbose:
                print(f"  ❌ Module not found: {module_path}")
                print(f"     Error: {str(e)}")
                print(f"     sys.path: {sys.path[:3]}...")  # Show first 3 paths
            return None
        except Exception as e:
            if self.verbose:
                print(f"  ❌ Import error for {module_path}: {str(e)}")
            return None
    
    def _check_github_auth(self) -> Dict[str, Any]:
        """Check GitHub authentication status via direct import"""
        if self.verbose:
            print("  🔍 Checking GitHub authentication...")
        
        # Try multiple possible module paths
        possible_paths = [
            'brain.core.github.auth_manager',
            'brain.core.github.auth',
            'brain.github.auth_manager',
            'brain.github.auth',
        ]
        
        for module_path in possible_paths:
            module = self._safe_import_module(module_path)
            if module is None:
                continue
            
            try:
                # Try to get AuthManager class
                if hasattr(module, 'AuthManager'):
                    AuthManager = getattr(module, 'AuthManager')
                    auth_manager = AuthManager()
                    
                    # Try different methods
                    if hasattr(auth_manager, 'get_status'):
                        status = auth_manager.get_status()
                        return {
                            'authenticated': status.get('authenticated', False),
                            'username': status.get('username', 'N/A'),
                            'checked_at': datetime.utcnow().isoformat() + 'Z'
                        }
                    elif hasattr(auth_manager, 'is_authenticated'):
                        authenticated = auth_manager.is_authenticated()
                        username = getattr(auth_manager, 'get_username', lambda: 'N/A')()
                        return {
                            'authenticated': authenticated,
                            'username': username,
                            'checked_at': datetime.utcnow().isoformat() + 'Z'
                        }
                    else:
                        # Check for token
                        token = getattr(auth_manager, 'token', None) or getattr(auth_manager, 'get_token', lambda: None)()
                        return {
                            'authenticated': token is not None,
                            'username': 'N/A',
                            'checked_at': datetime.utcnow().isoformat() + 'Z'
                        }
            except Exception as e:
                if self.verbose:
                    print(f"  ⚠️ Error using {module_path}: {str(e)}")
                continue
        
        # All imports failed
        return {
            'authenticated': False,
            'error': f'GitHub auth module not found. Tried: {", ".join(possible_paths)}'
        }
    
    def _check_gemini_keys(self) -> Dict[str, Any]:
        """Check Gemini API keys configuration via direct import"""
        if self.verbose:
            print("  🔍 Checking Gemini API keys...")
        
        # Try multiple possible module paths
        possible_paths = [
            'brain.core.gemini.keys_manager',
            'brain.core.gemini.manager',
            'brain.gemini.keys_manager',
            'brain.gemini.manager',
        ]
        
        for module_path in possible_paths:
            module = self._safe_import_module(module_path)
            if module is None:
                continue
            
            try:
                # Try to get KeysManager class
                if hasattr(module, 'KeysManager'):
                    KeysManager = getattr(module, 'KeysManager')
                    keys_manager = KeysManager()
                    
                    # Try different methods
                    if hasattr(keys_manager, 'list_keys'):
                        keys = keys_manager.list_keys()
                    elif hasattr(keys_manager, 'get_all_keys'):
                        keys = keys_manager.get_all_keys()
                    elif hasattr(keys_manager, 'keys'):
                        keys = keys_manager.keys
                    else:
                        keys = []
                    
                    return {
                        'configured': len(keys) > 0,
                        'key_count': len(keys),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
            except Exception as e:
                if self.verbose:
                    print(f"  ⚠️ Error using {module_path}: {str(e)}")
                continue
        
        # All imports failed
        return {
            'configured': False,
            'key_count': 0,
            'error': f'Gemini keys module not found. Tried: {", ".join(possible_paths)}'
        }
    
    def _check_nucleus_exists(self) -> Dict[str, Any]:
        """Check if at least one Nucleus exists via direct import"""
        if self.verbose:
            print("  🔍 Checking Nucleus existence...")
        
        # Try multiple possible module paths
        possible_paths = [
            'brain.core.nucleus.nucleus_manager',
            'brain.core.nucleus.manager',
            'brain.nucleus.nucleus_manager',
            'brain.nucleus.manager',
        ]
        
        for module_path in possible_paths:
            module = self._safe_import_module(module_path)
            if module is None:
                continue
            
            try:
                # Try to get NucleusManager class
                if hasattr(module, 'NucleusManager'):
                    NucleusManager = getattr(module, 'NucleusManager')
                    nucleus_manager = NucleusManager()
                    
                    if hasattr(nucleus_manager, 'list_nuclei'):
                        nuclei = nucleus_manager.list_nuclei()
                    elif hasattr(nucleus_manager, 'get_all_nuclei'):
                        nuclei = nucleus_manager.get_all_nuclei()
                    else:
                        # Fallback to manual scan
                        nuclei = self._scan_for_nuclei()
                    
                    return {
                        'exists': len(nuclei) > 0,
                        'nucleus_count': len(nuclei),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
            except Exception as e:
                if self.verbose:
                    print(f"  ⚠️ Error using {module_path}: {str(e)}")
                continue
        
        # Fallback: Manual scan
        nuclei = self._scan_for_nuclei()
        return {
            'exists': len(nuclei) > 0,
            'nucleus_count': len(nuclei),
            'error': f'Nucleus module not found. Using manual scan. Tried: {", ".join(possible_paths)}'
        }
    
    def _check_projects_added(self) -> Dict[str, Any]:
        """Check if projects have been added to Nucleus via direct import"""
        if self.verbose:
            print("  🔍 Checking added projects...")
        
        # Try multiple possible module paths
        possible_paths = [
            'brain.core.nucleus.nucleus_manager',
            'brain.core.nucleus.manager',
            'brain.nucleus.nucleus_manager',
            'brain.nucleus.manager',
        ]
        
        for module_path in possible_paths:
            module = self._safe_import_module(module_path)
            if module is None:
                continue
            
            try:
                # Try to get NucleusManager class
                if hasattr(module, 'NucleusManager'):
                    NucleusManager = getattr(module, 'NucleusManager')
                    nucleus_manager = NucleusManager()
                    
                    # Get nuclei list
                    if hasattr(nucleus_manager, 'list_nuclei'):
                        nuclei = nucleus_manager.list_nuclei()
                    else:
                        nuclei = self._scan_for_nuclei()
                    
                    if not nuclei:
                        return {'added': False, 'count': 0, 'error': 'No nucleus found'}
                    
                    # Check projects in first nucleus
                    first_nucleus = nuclei[0]
                    nucleus_path = first_nucleus.get('path') if isinstance(first_nucleus, dict) else str(first_nucleus)
                    
                    if hasattr(nucleus_manager, 'list_projects'):
                        projects = nucleus_manager.list_projects(nucleus_path)
                    elif hasattr(nucleus_manager, 'get_projects'):
                        projects = nucleus_manager.get_projects(nucleus_path)
                    else:
                        projects = self._scan_for_projects(nucleus_path)
                    
                    return {
                        'added': len(projects) > 0,
                        'count': len(projects),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
            except Exception as e:
                if self.verbose:
                    print(f"  ⚠️ Error using {module_path}: {str(e)}")
                continue
        
        # Fallback: Manual scan
        nuclei = self._scan_for_nuclei()
        if nuclei:
            first_nucleus = nuclei[0]
            nucleus_path = first_nucleus.get('path') if isinstance(first_nucleus, dict) else str(first_nucleus)
            projects = self._scan_for_projects(nucleus_path)
            return {
                'added': len(projects) > 0,
                'count': len(projects),
                'error': f'Projects module not found. Using manual scan. Tried: {", ".join(possible_paths)}'
            }
        
        return {
            'added': False,
            'count': 0,
            'error': 'No nucleus found for project check'
        }
    
    def _scan_for_nuclei(self) -> list:
        """Fallback: Manually scan for nucleus directories"""
        from pathlib import Path
        
        try:
            # Search in current directory and parents
            current = Path.cwd()
            nuclei = []
            
            # Check current directory
            if (current / '.bloom').exists():
                nuclei.append({'path': str(current)})
            
            # Check sibling directories (common in workspaces)
            if current.parent.exists():
                for sibling in current.parent.iterdir():
                    if sibling.is_dir() and (sibling / '.bloom').exists():
                        nuclei.append({'path': str(sibling)})
            
            return nuclei
        except Exception as e:
            if self.verbose:
                print(f"  ⚠️ Error scanning for nuclei: {str(e)}")
            return []
    
    def _scan_for_projects(self, nucleus_path: str) -> list:
        """Fallback: Manually scan for projects in nucleus"""
        from pathlib import Path
        import json
        
        try:
            nucleus_dir = Path(nucleus_path)
            bloom_dir = nucleus_dir / '.bloom'
            
            if not bloom_dir.exists():
                return []
            
            # Look for projects configuration file
            projects_file = bloom_dir / 'projects.json'
            if projects_file.exists():
                with open(projects_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('projects', [])
            
            # Alternative: scan subdirectories
            projects = []
            for item in nucleus_dir.iterdir():
                if item.is_dir() and item.name != '.bloom':
                    projects.append({'name': item.name, 'path': str(item)})
            
            return projects
        except Exception as e:
            if self.verbose:
                print(f"  ⚠️ Error scanning for projects: {str(e)}")
            return []