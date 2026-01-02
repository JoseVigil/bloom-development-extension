"""
Onboarding status manager - Pure business logic.
Aggregates status from multiple Brain subsystems.
"""

import subprocess
import json
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
        self.verbose = global_context.verbose if global_context else False
    
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
        """Check GitHub authentication status"""
        if self.verbose:
            print("  🔍 Checking GitHub authentication...")
        
        try:
            result = subprocess.run(
                ['python', '-m', 'brain', 'github', 'auth-status', '--json'],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',  # Ignore encoding errors
                timeout=10,
                env={**subprocess.os.environ, 'PYTHONIOENCODING': 'utf-8'}
            )
            
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                    authenticated = data.get('data', {}).get('authenticated', False)
                    return {
                        'authenticated': authenticated,
                        'username': data.get('data', {}).get('username', 'N/A'),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
                except json.JSONDecodeError:
                    return {'authenticated': False, 'error': 'Invalid JSON response'}
            else:
                return {'authenticated': False, 'error': 'GitHub auth check failed'}
        except subprocess.TimeoutExpired:
            return {'authenticated': False, 'error': 'Timeout'}
        except Exception as e:
            return {'authenticated': False, 'error': str(e)}
    
    def _check_gemini_keys(self) -> Dict[str, Any]:
        """Check Gemini API keys configuration"""
        if self.verbose:
            print("  🔍 Checking Gemini API keys...")
        
        try:
            result = subprocess.run(
                ['python', '-m', 'brain', 'gemini', 'keys-list', '--json'],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',
                timeout=10,
                env={**subprocess.os.environ, 'PYTHONIOENCODING': 'utf-8'}
            )
            
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                    keys = data.get('data', {}).get('keys', [])
                    configured = len(keys) > 0
                    return {
                        'configured': configured,
                        'key_count': len(keys),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
                except json.JSONDecodeError:
                    return {'configured': False, 'error': 'Invalid JSON response'}
            else:
                return {'configured': False, 'error': 'Gemini keys check failed'}
        except subprocess.TimeoutExpired:
            return {'configured': False, 'error': 'Timeout'}
        except Exception as e:
            return {'configured': False, 'error': str(e)}
    
    def _check_nucleus_exists(self) -> Dict[str, Any]:
        """Check if at least one Nucleus exists"""
        if self.verbose:
            print("  🔍 Checking Nucleus existence...")
        
        try:
            result = subprocess.run(
                ['python', '-m', 'brain', 'nucleus', 'list', '--json'],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',
                timeout=10,
                env={**subprocess.os.environ, 'PYTHONIOENCODING': 'utf-8'}
            )
            
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                    nuclei = data.get('data', {}).get('nuclei', [])
                    exists = len(nuclei) > 0
                    return {
                        'exists': exists,
                        'nucleus_count': len(nuclei),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
                except json.JSONDecodeError:
                    return {'exists': False, 'error': 'Invalid JSON response'}
            else:
                return {'exists': False, 'error': 'Nucleus list check failed'}
        except subprocess.TimeoutExpired:
            return {'exists': False, 'error': 'Timeout'}
        except Exception as e:
            return {'exists': False, 'error': str(e)}
    
    def _check_projects_added(self) -> Dict[str, Any]:
        """Check if projects have been added to Nucleus"""
        if self.verbose:
            print("  🔍 Checking added projects...")
        
        try:
            # First get nucleus list
            result = subprocess.run(
                ['python', '-m', 'brain', 'nucleus', 'list', '--json'],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='ignore',
                timeout=10,
                env={**subprocess.os.environ, 'PYTHONIOENCODING': 'utf-8'}
            )
            
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                    nuclei = data.get('data', {}).get('nuclei', [])
                    
                    if not nuclei:
                        return {'added': False, 'error': 'No nucleus found'}
                    
                    # Check first nucleus for projects
                    first_nucleus = nuclei[0].get('path', '.')
                    
                    projects_result = subprocess.run(
                        ['python', '-m', 'brain', 'nucleus', 'list-projects', '-p', first_nucleus, '--json'],
                        capture_output=True,
                        text=True,
                        encoding='utf-8',
                        errors='ignore',
                        timeout=10,
                        env={**subprocess.os.environ, 'PYTHONIOENCODING': 'utf-8'}
                    )
                    
                    if projects_result.returncode == 0:
                        projects_data = json.loads(projects_result.stdout)
                        projects = projects_data.get('data', {}).get('projects', [])
                        added = len(projects) > 0
                        return {
                            'added': added,
                            'project_count': len(projects),
                            'checked_at': datetime.utcnow().isoformat() + 'Z'
                        }
                    else:
                        return {'added': False, 'error': 'Failed to list projects'}
                except json.JSONDecodeError:
                    return {'added': False, 'error': 'Invalid JSON response'}
            else:
                return {'added': False, 'error': 'Nucleus list failed'}
        except subprocess.TimeoutExpired:
            return {'added': False, 'error': 'Timeout'}
        except Exception as e:
            return {'added': False, 'error': str(e)}