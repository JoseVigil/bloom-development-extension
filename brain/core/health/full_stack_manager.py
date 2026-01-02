"""
Core health check manager for Bloom Nucleus stack.
Pure business logic - no CLI dependencies.
"""

import socket
import json
import subprocess
import time
from datetime import datetime
from typing import Dict, Any, Optional


class FullStackHealthManager:
    """
    Manager for comprehensive health checks of Bloom Nucleus stack.
    Checks: bloom-host, API REST, Chrome extension, Brain CLI, and onboarding.
    """
    
    def __init__(self, global_context=None):
        """
        Initialize health manager.
        
        Args:
            global_context: Optional GlobalContext for verbose logging
        """
        self.gc = global_context
        self.verbose = global_context.verbose if global_context else False
    
    def check_all_components(self, timeout: int = 5) -> Dict[str, Any]:
        """
        Execute all health checks and return comprehensive results.
        
        Args:
            timeout: Timeout in seconds for each check
            
        Returns:
            Dict with status, details, timestamp, and health score
        """
        start_time = time.time()
        
        # Execute all checks independently
        checks = {
            'host': self._check_host(timeout),
            'api': self._check_api(timeout),
            'extension': self._check_extension(timeout),
            'brain': self._check_brain(),
            'onboarding': self._check_onboarding()
        }
        
        # Calculate overall status
        statuses = [v.get('status') for v in checks.values()]
        healthy_count = sum(1 for s in statuses if s in ['connected', 'online', 'installed', 'ok', 'ready'])
        total_count = len(statuses)
        
        overall_status = 'ok' if healthy_count == total_count else (
            'partial' if healthy_count >= total_count / 2 else 'error'
        )
        
        health_score = int((healthy_count / total_count) * 100)
        
        return {
            'status': overall_status,
            'details': checks,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'overall_health_score': health_score,
            'check_duration_ms': int((time.time() - start_time) * 1000)
        }
    
    def _check_host(self, timeout: int) -> Dict[str, Any]:
        """
        Check bloom-host.exe TCP connection on port 5678.
        
        Args:
            timeout: Connection timeout in seconds
            
        Returns:
            Dict with status, port, response_time_ms, and optional error
        """
        if self.verbose:
            print("🔍 Checking bloom-host.exe (TCP 5678)...")
        
        start = time.time()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex(('localhost', 5678))
            sock.close()
            
            response_time = int((time.time() - start) * 1000)
            
            if result == 0:
                return {
                    'status': 'connected',
                    'port': 5678,
                    'response_time_ms': response_time
                }
            else:
                return {
                    'status': 'disconnected',
                    'port': 5678,
                    'error': 'Connection refused'
                }
        except socket.timeout:
            return {
                'status': 'timeout',
                'port': 5678,
                'error': f'Timeout after {timeout}s'
            }
        except Exception as e:
            return {
                'status': 'error',
                'port': 5678,
                'error': str(e)
            }
    
    def _check_api(self, timeout: int) -> Dict[str, Any]:
        """
        Check REST API on port 48215.
        
        Args:
            timeout: Request timeout in seconds
            
        Returns:
            Dict with status, port, response_time_ms, version, and optional error
        """
        if self.verbose:
            print("🔍 Checking API REST (HTTP 48215)...")
        
        start = time.time()
        try:
            import requests
            
            response = requests.get(
                'http://localhost:48215/api/health',
                timeout=timeout
            )
            response_time = int((time.time() - start) * 1000)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    return {
                        'status': 'online',
                        'port': 48215,
                        'response_time_ms': response_time,
                        'version': data.get('version', 'unknown')
                    }
                except json.JSONDecodeError:
                    return {
                        'status': 'online',
                        'port': 48215,
                        'response_time_ms': response_time,
                        'version': 'unknown',
                        'warning': 'Invalid JSON response'
                    }
            else:
                return {
                    'status': 'error',
                    'port': 48215,
                    'http_status': response.status_code
                }
        except Exception as timeout_error:
            if 'timeout' in str(timeout_error).lower():
                return {
                    'status': 'timeout',
                    'port': 48215,
                    'error': f'Timeout after {timeout}s'
                }
            else:
                return {
                    'status': 'offline',
                    'port': 48215,
                    'error': str(timeout_error)
                }
    
    def _check_extension(self, timeout: int) -> Dict[str, Any]:
        """
        Check Chrome extension via registry or filesystem.
        
        Args:
            timeout: Not used, kept for signature consistency
            
        Returns:
            Dict with status, method, manifest info, and optional error
        """
        if self.verbose:
            print("🔍 Checking Chrome extension...")
        
        try:
            # Method 1: Check Windows registry
            try:
                import winreg
                key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Google\Chrome\NativeMessagingHosts\com.bloom.host"
                )
                manifest_path = winreg.QueryValue(key, None)
                winreg.CloseKey(key)
                
                return {
                    'status': 'installed',
                    'method': 'registry',
                    'manifest_path': manifest_path,
                    'manifest_version': 3
                }
            except (WindowsError, ImportError):
                pass
            
            # Method 2: Check default filesystem location
            import os
            default_path = os.path.expandvars(
                r"%LOCALAPPDATA%\BloomNucleus\extension\manifest.json"
            )
            if os.path.exists(default_path):
                try:
                    with open(default_path, 'r') as f:
                        manifest = json.load(f)
                    return {
                        'status': 'installed',
                        'method': 'filesystem',
                        'manifest_path': default_path,
                        'manifest_version': manifest.get('manifest_version', 'unknown')
                    }
                except Exception as read_error:
                    return {
                        'status': 'installed',
                        'method': 'filesystem',
                        'manifest_path': default_path,
                        'manifest_version': 'unknown',
                        'warning': f'Could not read manifest: {str(read_error)}'
                    }
            
            return {
                'status': 'not_found',
                'error': 'Extension manifest not found in registry or filesystem'
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def _check_brain(self) -> Dict[str, Any]:
        """
        Check Brain CLI version and uptime.
        
        Returns:
            Dict with status, version, uptime_seconds, and optional error
        """
        if self.verbose:
            print("🔍 Checking Brain CLI...")
        
        try:
            # Get version
            result = subprocess.run(
                [...],
                capture_output=True,
                text=True,
                encoding='utf-8', 
                errors='replace',  
                timeout=...
            )
            version = result.stdout.strip() if result.returncode == 0 else 'unknown'
            
            # Uptime (mock - would need persistent storage in production)
            # TODO: Implement actual uptime tracking with persistent cache
            uptime_seconds = 3600
            
            return {
                'status': 'ok',
                'version': version,
                'uptime_seconds': uptime_seconds
            }
        except subprocess.TimeoutExpired:
            return {
                'status': 'error',
                'error': 'Timeout getting Brain version'
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def _check_onboarding(self) -> Dict[str, Any]:
        """
        Check onboarding status via existing nucleus command.
        
        Returns:
            Dict with status, current_step, details, and optional error
        """
        if self.verbose:
            print("🔍 Checking onboarding status...")
        
        try:
            # Call existing nucleus onboarding-status command
            result = subprocess.run(
                ['python', '-m', 'brain', 'nucleus', 'onboarding-status', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                    ready = data.get('ready', False)
                    
                    return {
                        'status': 'ready' if ready else 'incomplete',
                        'current_step': data.get('current_step', 'unknown'),
                        'completed': data.get('completed', False),
                        'details': data.get('details', {})
                    }
                except json.JSONDecodeError:
                    return {
                        'status': 'error',
                        'error': 'Invalid JSON from onboarding-status command'
                    }
            else:
                return {
                    'status': 'error',
                    'error': 'Failed to get onboarding status',
                    'stderr': result.stderr
                }
        except subprocess.TimeoutExpired:
            return {
                'status': 'error',
                'error': 'Timeout calling onboarding-status command'
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }