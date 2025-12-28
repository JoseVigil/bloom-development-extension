"""
Core business logic for onboarding status verification.
Integrates with existing Brain commands via subprocess.
"""

import subprocess
import json
from typing import Dict, Any
from datetime import datetime


class OnboardingStatusManager:
    """
    Manages onboarding status checks by orchestrating existing Brain commands.
    Pure orchestration - no business logic duplication.
    """
    
    def __init__(self, gc):
        self.gc = gc
        self.verbose = gc.verbose if hasattr(gc, 'verbose') else False
    
    def check_onboarding_status(self, refresh: bool = False) -> Dict[str, Any]:
        """
        Aggregate onboarding status from multiple components.
        
        Args:
            refresh: Force re-check, ignore any caching
            
        Returns:
            Onboarding status dictionary
        """
        details = {
            'github': self._check_github_auth(),
            'gemini': self._check_gemini_keys(),
            'nucleus': self._check_nucleus_exists(),
            'projects': self._check_projects_added()
        }
        
        # Determine current step
        current_step = self._determine_current_step(details)
        
        # Calculate completion
        completed_count = sum(
            1 for component in details.values() 
            if self._is_component_complete(component)
        )
        completion_percentage = int((completed_count / 4) * 100)
        
        ready = (current_step == "completed")
        
        return {
            'ready': ready,
            'current_step': current_step,
            'completed': ready,
            'details': details,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'completion_percentage': completion_percentage
        }
    
    def _check_github_auth(self) -> Dict[str, Any]:
        """Check GitHub authentication via brain github auth-status"""
        if self.verbose:
            print("🔍 Checking GitHub authentication...")
        
        try:
            result = subprocess.run(
                ['python', '-m', 'brain', 'github', 'auth-status', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                return {
                    'authenticated': data.get('authenticated', False),
                    'username': data.get('username', 'unknown'),
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            else:
                return {
                    'authenticated': False,
                    'error': 'Failed to check auth status',
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
        except Exception as e:
            return {
                'authenticated': False,
                'error': str(e),
                'checked_at': datetime.utcnow().isoformat() + 'Z'
            }
    
    def _check_gemini_keys(self) -> Dict[str, Any]:
        """Check Gemini keys via brain gemini keys-list"""
        if self.verbose:
            print("🔍 Checking Gemini API keys...")
        
        try:
            # First, list keys
            result = subprocess.run(
                ['python', '-m', 'brain', 'gemini', 'keys-list', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return {
                    'configured': False,
                    'valid_keys': 0,
                    'error': 'Failed to list keys',
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            
            keys_data = json.loads(result.stdout)
            keys_count = len(keys_data.get('keys', []))
            
            if keys_count == 0:
                return {
                    'configured': False,
                    'valid_keys': 0,
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            
            # Validate keys
            validate_result = subprocess.run(
                ['python', '-m', 'brain', 'gemini', 'validate', '--json'],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if validate_result.returncode == 0:
                validate_data = json.loads(validate_result.stdout)
                valid_count = validate_data.get('valid_keys', 0)
                
                return {
                    'configured': valid_count > 0,
                    'valid_keys': valid_count,
                    'total_keys': keys_count,
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            else:
                return {
                    'configured': True,  # Keys exist but validation failed
                    'valid_keys': 0,
                    'total_keys': keys_count,
                    'error': 'Key validation failed',
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
                
        except Exception as e:
            return {
                'configured': False,
                'valid_keys': 0,
                'error': str(e),
                'checked_at': datetime.utcnow().isoformat() + 'Z'
            }
    
    def _check_nucleus_exists(self) -> Dict[str, Any]:
        """Check if nucleus exists via brain nucleus list"""
        if self.verbose:
            print("🔍 Checking Nucleus existence...")
        
        try:
            result = subprocess.run(
                ['python', '-m', 'brain', 'nucleus', 'list', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                nuclei = data.get('nuclei', [])
                count = len(nuclei)
                
                if count > 0:
                    active = nuclei[0] if nuclei else {}
                    return {
                        'exists': True,
                        'count': count,
                        'active_id': active.get('id', 'unknown'),
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
                else:
                    return {
                        'exists': False,
                        'count': 0,
                        'checked_at': datetime.utcnow().isoformat() + 'Z'
                    }
            else:
                return {
                    'exists': False,
                    'count': 0,
                    'error': 'Failed to list nuclei',
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
        except Exception as e:
            return {
                'exists': False,
                'count': 0,
                'error': str(e),
                'checked_at': datetime.utcnow().isoformat() + 'Z'
            }
    
    def _check_projects_added(self) -> Dict[str, Any]:
        """Check if projects are added via brain nucleus projects"""
        if self.verbose:
            print("🔍 Checking projects addition...")
        
        try:
            result = subprocess.run(
                ['python', '-m', 'brain', 'nucleus', 'projects', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                projects = data.get('projects', [])
                count = len(projects)
                
                return {
                    'added': count > 0,
                    'count': count,
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
            else:
                return {
                    'added': False,
                    'count': 0,
                    'error': 'Failed to list projects',
                    'checked_at': datetime.utcnow().isoformat() + 'Z'
                }
        except Exception as e:
            return {
                'added': False,
                'count': 0,
                'error': str(e),
                'checked_at': datetime.utcnow().isoformat() + 'Z'
            }
    
    def _is_component_complete(self, component: Dict[str, Any]) -> bool:
        """Check if a component is complete"""
        return (
            component.get('authenticated', False) or
            component.get('configured', False) or
            component.get('exists', False) or
            component.get('added', False)
        )
    
    def _determine_current_step(self, details: Dict[str, Any]) -> str:
        """Determine current onboarding step based on component status"""
        if not self._is_component_complete(details['github']):
            return "welcome"
        elif not self._is_component_complete(details['gemini']):
            return "gemini"
        elif not self._is_component_complete(details['nucleus']):
            return "nucleus"
        elif not self._is_component_complete(details['projects']):
            return "projects"
        else:
            return "completed"