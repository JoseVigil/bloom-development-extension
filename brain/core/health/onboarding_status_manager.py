"""
Onboarding status manager - Pure business logic.
Aggregates status from multiple Brain subsystems.
"""

from typing import Dict, Any
from datetime import datetime


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
    
    def _check_github_auth(self) -> Dict[str, Any]:
        """Check GitHub authentication status via direct import"""
        if self.verbose:
            print("  🔍 Checking GitHub authentication...")
        
        try:
            from brain.core.github.auth_manager import AuthManager
            
            auth_manager = AuthManager()
            
            # Verificar si el método existe
            if hasattr(auth_manager, 'get_status'):
                status = auth_manager.get_status()
                return {
                    'authenticated': status.get('authenticated', False),
                    'username': status.get('username', 'N/A'),
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            elif hasattr(auth_manager, 'is_authenticated'):
                # Alternativa si usa otro método
                authenticated = auth_manager.is_authenticated()
                username = getattr(auth_manager, 'get_username', lambda: 'N/A')()
                return {
                    'authenticated': authenticated,
                    'username': username,
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            else:
                # Intentar verificar por presencia de token
                token = getattr(auth_manager, 'token', None) or getattr(auth_manager, 'get_token', lambda: None)()
                return {
                    'authenticated': token is not None,
                    'username': 'N/A',
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
        except Exception as e:
            return {
                'authenticated': False,
                'error': f'GitHub auth check failed: {str(e)}'
            }
    
    def _check_gemini_keys(self) -> Dict[str, Any]:
        """Check Gemini API keys configuration via direct import"""
        if self.verbose:
            print("  🔍 Checking Gemini API keys...")
        
        try:
            from brain.core.gemini.keys_manager import KeysManager
            
            keys_manager = KeysManager()
            
            # Verificar método disponible
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
            return {
                'configured': False,
                'error': f'Gemini keys check failed: {str(e)}'
            }
    
    def _check_nucleus_exists(self) -> Dict[str, Any]:
        """Check if at least one Nucleus exists via direct import"""
        if self.verbose:
            print("  🔍 Checking Nucleus existence...")
        
        try:
            from brain.core.nucleus.nucleus_manager import NucleusManager
            from pathlib import Path
            
            # Intentar diferentes enfoques según la API disponible
            try:
                nucleus_manager = NucleusManager()
                
                if hasattr(nucleus_manager, 'list_nuclei'):
                    nuclei = nucleus_manager.list_nuclei()
                elif hasattr(nucleus_manager, 'get_all_nuclei'):
                    nuclei = nucleus_manager.get_all_nuclei()
                else:
                    # Fallback: buscar directorios con .bloom
                    nuclei = self._scan_for_nuclei()
                
                return {
                    'exists': len(nuclei) > 0,
                    'nucleus_count': len(nuclei),
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            except Exception as inner_e:
                # Fallback: escanear manualmente
                nuclei = self._scan_for_nuclei()
                return {
                    'exists': len(nuclei) > 0,
                    'nucleus_count': len(nuclei),
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
        except Exception as e:
            return {
                'exists': False,
                'error': f'Nucleus check failed: {str(e)}'
            }
    
    def _check_projects_added(self) -> Dict[str, Any]:
        """Check if projects have been added to Nucleus via direct import"""
        if self.verbose:
            print("  🔍 Checking added projects...")
        
        try:
            from brain.core.nucleus.nucleus_manager import NucleusManager
            
            nucleus_manager = NucleusManager()
            
            # Obtener lista de nuclei
            if hasattr(nucleus_manager, 'list_nuclei'):
                nuclei = nucleus_manager.list_nuclei()
            else:
                nuclei = self._scan_for_nuclei()
            
            if not nuclei:
                return {'added': False, 'error': 'No nucleus found'}
            
            # Verificar proyectos en el primer nucleus
            first_nucleus = nuclei[0]
            nucleus_path = first_nucleus.get('path') if isinstance(first_nucleus, dict) else str(first_nucleus)
            
            if hasattr(nucleus_manager, 'list_projects'):
                projects = nucleus_manager.list_projects(nucleus_path)
            elif hasattr(nucleus_manager, 'get_projects'):
                projects = nucleus_manager.get_projects(nucleus_path)
            else:
                # Fallback: escanear manualmente
                projects = self._scan_for_projects(nucleus_path)
            
            return {
                'added': len(projects) > 0,
                'project_count': len(projects),
                'checked_at': datetime.utcnow().isoformat() + 'Z'
            }
        except Exception as e:
            return {
                'added': False,
                'error': f'Projects check failed: {str(e)}'
            }
    
    def _scan_for_nuclei(self) -> list:
        """Fallback: Manually scan for nucleus directories"""
        from pathlib import Path
        
        try:
            # Buscar en directorio actual y padres
            current = Path.cwd()
            nuclei = []
            
            # Verificar directorio actual
            if (current / '.bloom').exists():
                nuclei.append({'path': str(current)})
            
            # Verificar directorios hermanos (común en workspaces)
            if current.parent.exists():
                for sibling in current.parent.iterdir():
                    if sibling.is_dir() and (sibling / '.bloom').exists():
                        nuclei.append({'path': str(sibling)})
            
            return nuclei
        except Exception:
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
            
            # Buscar archivo de configuración de proyectos
            projects_file = bloom_dir / 'projects.json'
            if projects_file.exists():
                with open(projects_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('projects', [])
            
            # Alternativa: escanear subdirectorios
            projects = []
            for item in nucleus_dir.iterdir():
                if item.is_dir() and item.name != '.bloom':
                    projects.append({'name': item.name, 'path': str(item)})
            
            return projects
        except Exception:
            return []