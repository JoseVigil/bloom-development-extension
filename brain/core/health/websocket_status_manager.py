"""
Core business logic for WebSocket health verification.
Uses websockets library for async connection testing.
"""

import asyncio
import time
import json
from typing import Dict, Any, Optional
from datetime import datetime


class WebSocketStatusManager:
    """
    Manages WebSocket server health checks.
    All operations are non-blocking and timeout-safe.
    """
    
    def __init__(self, gc):
        self.gc = gc
        self.verbose = gc.verbose if hasattr(gc, 'verbose') else False
        self.host = "localhost"
        self.port = 4124
    
    def check_websocket_status(
        self, 
        timeout: int = 5,
        test_subscription: bool = False
    ) -> Dict[str, Any]:
        """
        Check WebSocket server connectivity and health.
        
        Args:
            timeout: Connection timeout in seconds
            test_subscription: Whether to test event subscription
            
        Returns:
            WebSocket status dictionary
        """
        # Run async check in sync context
        return asyncio.run(
            self._async_check_websocket(timeout, test_subscription)
        )
    
    async def _async_check_websocket(
        self,
        timeout: int,
        test_subscription: bool
    ) -> Dict[str, Any]:
        """Async implementation of WebSocket check"""
        start_time = time.time()
        
        try:
            import websockets
        except ImportError:
            return {
                'status': 'error',
                'details': {
                    'host': self.host,
                    'port': self.port,
                    'protocol': 'ws',
                    'connected': False,
                    'error': 'websockets library not installed. Run: pip install websockets'
                },
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'uptime_seconds': 'N/A'
            }
        
        uri = f"ws://{self.host}:{self.port}"
        
        if self.verbose:
            print(f"🔍 Connecting to {uri}...")
        
        try:
            async with asyncio.timeout(timeout):
                async with websockets.connect(uri) as websocket:
                    connection_time = int((time.time() - start_time) * 1000)
                    
                    if self.verbose:
                        print("✅ Connection established")
                    
                    # Test ping/pong
                    ping_result = await self._test_ping(websocket)
                    
                    # Test subscription if requested
                    subscription_result = None
                    if test_subscription:
                        subscription_result = await self._test_subscription(websocket)
                    
                    # Try to get server info (if server supports it)
                    server_info = await self._get_server_info(websocket)
                    
                    details = {
                        'host': self.host,
                        'port': self.port,
                        'protocol': 'ws',
                        'connected': True,
                        'ping_response': ping_result.get('success', False),
                        'ping_latency_ms': ping_result.get('latency_ms', 'N/A')
                    }
                    
                    if subscription_result:
                        details['subscription_capable'] = subscription_result.get('success', False)
                    
                    if server_info:
                        details.update(server_info)
                    
                    return {
                        'status': 'connected',
                        'uptime_seconds': server_info.get('uptime_seconds', 'N/A') if server_info else 'N/A',
                        'details': details,
                        'timestamp': datetime.utcnow().isoformat() + 'Z',
                        'connection_duration_ms': connection_time
                    }
        
        except asyncio.TimeoutError:
            return {
                'status': 'disconnected',
                'details': {
                    'host': self.host,
                    'port': self.port,
                    'protocol': 'ws',
                    'connected': False,
                    'error': f'Connection timeout after {timeout}s'
                },
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'uptime_seconds': 'N/A'
            }
        
        except ConnectionRefusedError:
            return {
                'status': 'disconnected',
                'details': {
                    'host': self.host,
                    'port': self.port,
                    'protocol': 'ws',
                    'connected': False,
                    'error': 'Connection refused - server may not be running'
                },
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'uptime_seconds': 'N/A'
            }
        
        except Exception as e:
            return {
                'status': 'error',
                'details': {
                    'host': self.host,
                    'port': self.port,
                    'protocol': 'ws',
                    'connected': False,
                    'error': str(e)
                },
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'uptime_seconds': 'N/A'
            }
    
    async def _test_ping(self, websocket) -> Dict[str, Any]:
        """Test WebSocket ping/pong"""
        if self.verbose:
            print("🏓 Testing ping/pong...")
        
        try:
            start = time.time()
            pong = await websocket.ping()
            await asyncio.wait_for(pong, timeout=3)
            latency = int((time.time() - start) * 1000)
            
            if self.verbose:
                print(f"✅ Ping successful ({latency}ms)")
            
            return {
                'success': True,
                'latency_ms': latency
            }
        except Exception as e:
            if self.verbose:
                print(f"❌ Ping failed: {e}")
            
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _test_subscription(self, websocket) -> Dict[str, Any]:
        """Test event subscription capability"""
        if self.verbose:
            print("📡 Testing event subscription...")
        
        try:
            # Send test subscription request
            subscription_msg = {
                'type': 'subscribe',
                'event': 'nucleus:test',
                'test': True  # Indicate this is a health check
            }
            
            await websocket.send(json.dumps(subscription_msg))
            
            # Wait for acknowledgment (with timeout)
            response = await asyncio.wait_for(websocket.recv(), timeout=3)
            data = json.loads(response)
            
            success = data.get('type') == 'subscription_ack'
            
            if self.verbose:
                status = "✅" if success else "❌"
                print(f"{status} Subscription test: {success}")
            
            return {
                'success': success,
                'response': data
            }
        except asyncio.TimeoutError:
            if self.verbose:
                print("⚠️  Subscription test timeout - server may not support it")
            
            return {
                'success': False,
                'error': 'Timeout waiting for subscription acknowledgment'
            }
        except Exception as e:
            if self.verbose:
                print(f"❌ Subscription test failed: {e}")
            
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _get_server_info(self, websocket) -> Optional[Dict[str, Any]]:
        """Attempt to get server version and uptime"""
        if self.verbose:
            print("📊 Requesting server info...")
        
        try:
            # Send info request (server may not support this)
            info_msg = {
                'type': 'get_info',
                'test': True
            }
            
            await websocket.send(json.dumps(info_msg))
            
            # Wait for response (short timeout)
            response = await asyncio.wait_for(websocket.recv(), timeout=2)
            data = json.loads(response)
            
            if data.get('type') == 'info':
                if self.verbose:
                    print("✅ Server info received")
                
                return {
                    'server_version': data.get('version', 'unknown'),
                    'uptime_seconds': data.get('uptime', 'N/A')
                }
        except:
            # Server doesn't support info - not an error
            if self.verbose:
                print("ℹ️  Server info not available")
            pass
        
        return None