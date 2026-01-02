"""
WebSocket health check manager - Pure business logic.
Tests WebSocket server connectivity and capabilities.
"""

import asyncio
import time
from datetime import datetime
from typing import Dict, Any


class WebSocketStatusManager:
    """
    Manager for WebSocket server health checks.
    Tests connection, ping/pong, and event subscription capabilities.
    """
    
    def __init__(self, global_context=None):
        """
        Initialize WebSocket status manager.
        
        Args:
            global_context: Optional GlobalContext for verbose logging
        """
        self.gc = global_context
        self.verbose = global_context.verbose if global_context else False
    
    def check_websocket_status(self, timeout: int = 5, test_subscription: bool = False) -> Dict[str, Any]:
        """
        Check WebSocket server health and connectivity.
        
        Args:
            timeout: Connection timeout in seconds
            test_subscription: If True, test event subscription capability
            
        Returns:
            Dict with status, details, connection metrics, and capabilities
        """
        if self.verbose:
            print("🔍 Checking WebSocket server on localhost:4124...")
        
        start_time = time.time()
        
        try:
            # Run async check in sync context
            result = asyncio.run(self._async_check_websocket(timeout, test_subscription))
            
            result['connection_duration_ms'] = int((time.time() - start_time) * 1000)
            result['timestamp'] = datetime.utcnow().isoformat() + 'Z'
            
            return result
            
        except Exception as e:
            return {
                'status': 'error',
                'details': {
                    'host': 'localhost',
                    'port': 4124,
                    'protocol': 'ws',
                    'connected': False,
                    'error': str(e)
                },
                'connection_duration_ms': int((time.time() - start_time) * 1000),
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
    
    async def _async_check_websocket(self, timeout: int, test_subscription: bool) -> Dict[str, Any]:
        """
        Async WebSocket check implementation.
        
        Args:
            timeout: Connection timeout
            test_subscription: Test subscription capability
            
        Returns:
            Status dict with connection details
        """
        try:
            import websockets
            
            uri = "ws://localhost:4124"
            
            if self.verbose:
                print(f"  🔌 Connecting to {uri}...")
            
            # Attempt connection
            async with websockets.connect(uri, timeout=timeout) as websocket:
                if self.verbose:
                    print("  ✅ Connected successfully")
                
                # Test ping/pong
                ping_start = time.time()
                pong_waiter = await websocket.ping()
                await asyncio.wait_for(pong_waiter, timeout=timeout)
                ping_latency = int((time.time() - ping_start) * 1000)
                
                if self.verbose:
                    print(f"  🏓 Ping/Pong: {ping_latency}ms")
                
                details = {
                    'host': 'localhost',
                    'port': 4124,
                    'protocol': 'ws',
                    'connected': True,
                    'ping_response': True,
                    'ping_latency_ms': ping_latency
                }
                
                # Optional: Test subscription capability
                if test_subscription:
                    if self.verbose:
                        print("  📡 Testing event subscription...")
                    
                    try:
                        # Send subscribe message
                        subscribe_msg = {
                            "action": "subscribe",
                            "event": "test_event"
                        }
                        await websocket.send(str(subscribe_msg))
                        
                        # Wait for acknowledgment (with timeout)
                        response = await asyncio.wait_for(websocket.recv(), timeout=2)
                        details['subscription_capable'] = True
                        
                        if self.verbose:
                            print("  ✅ Subscription test passed")
                    except asyncio.TimeoutError:
                        details['subscription_capable'] = False
                        details['subscription_warning'] = 'No acknowledgment received'
                    except Exception as sub_error:
                        details['subscription_capable'] = False
                        details['subscription_error'] = str(sub_error)
                
                return {
                    'status': 'connected',
                    'details': details,
                    'uptime_seconds': 'N/A'  # Would need server-side tracking
                }
                
        except asyncio.TimeoutError:
            return {
                'status': 'timeout',
                'details': {
                    'host': 'localhost',
                    'port': 4124,
                    'protocol': 'ws',
                    'connected': False,
                    'error': f'Connection timeout after {timeout}s'
                },
                'uptime_seconds': 'N/A'
            }
        except ConnectionRefusedError:
            return {
                'status': 'disconnected',
                'details': {
                    'host': 'localhost',
                    'port': 4124,
                    'protocol': 'ws',
                    'connected': False,
                    'error': 'Connection refused - server may be offline'
                },
                'uptime_seconds': 'N/A'
            }
        except ImportError:
            return {
                'status': 'error',
                'details': {
                    'host': 'localhost',
                    'port': 4124,
                    'protocol': 'ws',
                    'connected': False,
                    'error': 'websockets library not installed. Run: pip install websockets'
                },
                'uptime_seconds': 'N/A'
            }
        except Exception as e:
            return {
                'status': 'error',
                'details': {
                    'host': 'localhost',
                    'port': 4124,
                    'protocol': 'ws',
                    'connected': False,
                    'error': str(e)
                },
                'uptime_seconds': 'N/A'
            }