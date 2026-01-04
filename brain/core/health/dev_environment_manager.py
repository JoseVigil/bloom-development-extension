"""
Development environment detection manager - Pure business logic.
Detects dev vs production mode by checking HTTP endpoints.
"""

import socket
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple
from datetime import datetime


class DevEnvironmentManager:
    """
    Manager for detecting development environment status.
    Uses HTTP requests to detect dev server and TCP for backend services.
    """
    
    # Service configurations
    SERVICES = {
        'dev_server': {
            'type': 'http',
            'url': 'http://localhost:5173/',
            'port': 5173
        },
        'api': {
            'type': 'tcp',
            'port': 48215
        },
        'websocket': {
            'type': 'tcp',
            'port': 4124
        }
    }
    
    HOSTS = ['localhost', '127.0.0.1']
    
    def __init__(self):
        """Initialize development environment manager."""
        pass
    
    def detect_environment(self, timeout: float = 2.0) -> Dict[str, Any]:
        """
        Detect if running in development or production environment.
        
        Checks:
        1. HTTP request to Vite dev server (http://localhost:5173/) → DEV mode
        2. TCP checks for API and WebSocket services
        
        Args:
            timeout: Connection timeout in seconds
            
        Returns:
            Dictionary with environment detection results
        """
        services_status = {}
        
        # Check each service based on type
        for service_name, config in self.SERVICES.items():
            if config['type'] == 'http':
                is_available, host = self._check_http_endpoint(config['url'], timeout)
                services_status[service_name] = {
                    'available': is_available,
                    'host': host,
                    'port': config['port']
                }
            else:  # tcp
                is_open, host = self._check_port_multi_host(config['port'], timeout)
                services_status[service_name] = {
                    'available': is_open,
                    'host': host,
                    'port': config['port']
                }
        
        # Determine mode based on dev_server
        dev_server_open = services_status['dev_server']['available']
        is_dev_mode = dev_server_open
        
        if is_dev_mode:
            dev_host = services_status['dev_server']['host']
            reason = f"Dev server running on port {self.SERVICES['dev_server']['port']} ({dev_host})"
        else:
            reason = "Production mode: dev server not detected"
        
        return {
            'is_dev_mode': is_dev_mode,
            'reason': reason,
            'services': services_status,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
    
    def check_backend_ready(self, timeout: float = 2.0) -> Dict[str, Any]:
        """
        Check if backend services (API + WebSocket) are ready.
        
        Args:
            timeout: Connection timeout in seconds
            
        Returns:
            Dictionary with backend readiness status
        """
        api_open, _ = self._check_port_multi_host(self.SERVICES['api']['port'], timeout)
        ws_open, _ = self._check_port_multi_host(self.SERVICES['websocket']['port'], timeout)
        
        missing = []
        if not api_open:
            missing.append(f"API (port {self.SERVICES['api']['port']})")
        if not ws_open:
            missing.append(f"WebSocket (port {self.SERVICES['websocket']['port']})")
        
        return {
            'ready': api_open and ws_open,
            'api_available': api_open,
            'websocket_available': ws_open,
            'missing_services': missing
        }
    
    def check_specific_port(self, port: int, timeout: float = 2.0) -> Dict[str, Any]:
        """
        Check if a specific port is open.
        
        Args:
            port: Port number to check
            timeout: Connection timeout in seconds
            
        Returns:
            Dictionary with port status
            
        Raises:
            ValueError: If port is invalid
        """
        if not isinstance(port, int) or port < 1 or port > 65535:
            raise ValueError(f"Invalid port number: {port}")
        
        is_open, host = self._check_port_multi_host(port, timeout)
        
        return {
            'port': port,
            'is_open': is_open,
            'host': host
        }
    
    def _check_http_endpoint(self, url: str, timeout: float) -> Tuple[bool, Optional[str]]:
        """
        Check if an HTTP endpoint is responding.
        
        Args:
            url: Full URL to check (e.g., 'http://localhost:5173/')
            timeout: Request timeout in seconds
            
        Returns:
            Tuple of (is_available: bool, host: str or None)
        """
        try:
            # Extract host from URL
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or 'localhost'
            
            # Make HTTP request
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=timeout) as response:
                # Any successful response (200-299) means it's available
                if 200 <= response.status < 300:
                    return (True, host)
                return (False, None)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
            # Try alternate URLs if main fails
            if 'localhost' in url:
                alt_url = url.replace('localhost', '127.0.0.1')
                try:
                    req = urllib.request.Request(alt_url, method='GET')
                    with urllib.request.urlopen(req, timeout=timeout) as response:
                        if 200 <= response.status < 300:
                            return (True, '127.0.0.1')
                except:
                    pass
            return (False, None)
    
    def _check_port_open(self, port: int, host: str = 'localhost', timeout: float = 2.0) -> bool:
        """
        Check if a port is open using TCP connection.
        
        Args:
            port: Port number to check
            host: Host to check
            timeout: Connection timeout in seconds
        
        Returns:
            True if port is open, False otherwise
        """
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            return result == 0
        except:
            return False
        finally:
            if sock:
                try:
                    sock.close()
                except:
                    pass
    
    def _check_port_multi_host(self, port: int, timeout: float = 2.0) -> Tuple[bool, Optional[str]]:
        """
        Check port on multiple hosts.
        
        Args:
            port: Port number to check
            timeout: Connection timeout in seconds
        
        Returns:
            Tuple of (is_open: bool, host: str or None)
        """
        for host in self.HOSTS:
            try:
                if self._check_port_open(port, host, timeout):
                    return (True, host)
            except:
                continue
        return (False, None)