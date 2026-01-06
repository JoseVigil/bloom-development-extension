"""
Native host manager - Pure business logic for native host connectivity.
Tests bloom-host.exe via TCP socket using proper binary framing protocol.

Uses Length-Prefix Framing (4 bytes Little Endian + JSON UTF-8) matching Chrome Native Messaging.
"""

import socket
import struct
import time
import json
import subprocess
import platform
from typing import Dict, Any, Optional
from datetime import datetime


class NativeHostManager:
    """
    Manager for native host (bloom-host.exe) connectivity checks.
    
    This class provides TCP-based ping functionality using the proper
    binary framing protocol (4-byte length prefix + JSON body).
    """
    
    # bloom-host.cpp constants
    BASE_PORT = 5678
    MAX_PORT_ATTEMPTS = 20
    WS_PORT = 4124
    
    def __init__(self, verbose: bool = False):
        """
        Initialize native host manager.
        
        Args:
            verbose: Enable detailed logging
        """
        self.verbose = verbose
    
    def _send_message(self, sock: socket.socket, message: Dict[str, Any]) -> None:
        """
        Send message using Length-Prefix Framing protocol.
        
        Protocol:
        - 4 bytes: message length (Little Endian uint32)
        - N bytes: JSON message body (UTF-8)
        
        Args:
            sock: Connected socket
            message: Dictionary to send as JSON
        """
        # Serialize to JSON and encode to UTF-8
        body = json.dumps(message).encode('utf-8')
        
        # Create 4-byte length header (Little Endian)
        header = struct.pack('<I', len(body))
        
        # Send header + body
        sock.sendall(header + body)
        
        if self.verbose:
            print(f"   📤 Sent: {len(body)} bytes with 4-byte header")
    
    def _recv_message(self, sock: socket.socket, timeout_sec: float) -> Optional[Dict[str, Any]]:
        """
        Receive message using Length-Prefix Framing protocol.
        
        Protocol:
        - Read 4 bytes: message length (Little Endian uint32)
        - Read N bytes: JSON message body (UTF-8)
        
        Args:
            sock: Connected socket
            timeout_sec: Timeout for receive operations
            
        Returns:
            Parsed JSON dictionary or None if error
        """
        sock.settimeout(timeout_sec)
        
        try:
            # Step 1: Read 4-byte header
            header_bytes = self._recv_exact(sock, 4)
            if not header_bytes:
                if self.verbose:
                    print("   ⚠️  No header received")
                return None
            
            # Step 2: Unpack length (Little Endian)
            message_length = struct.unpack('<I', header_bytes)[0]
            
            if self.verbose:
                print(f"   📥 Expecting message: {message_length} bytes")
            
            # Sanity check
            if message_length > 10 * 1024 * 1024:  # 10MB max
                if self.verbose:
                    print(f"   ⚠️  Message too large: {message_length} bytes")
                return None
            
            # Step 3: Read exact message body
            body_bytes = self._recv_exact(sock, message_length)
            if not body_bytes:
                if self.verbose:
                    print("   ⚠️  Incomplete body received")
                return None
            
            # Step 4: Decode and parse JSON
            body_str = body_bytes.decode('utf-8')
            message = json.loads(body_str)
            
            if self.verbose:
                print(f"   ✅ Received: {message}")
            
            return message
            
        except struct.error as e:
            if self.verbose:
                print(f"   ❌ Framing error: {e}")
            return None
        except json.JSONDecodeError as e:
            if self.verbose:
                print(f"   ❌ JSON decode error: {e}")
            return None
        except socket.timeout:
            if self.verbose:
                print(f"   ⏱️  Timeout waiting for response")
            return None
        except Exception as e:
            if self.verbose:
                print(f"   ❌ Receive error: {e}")
            return None
    
    def _recv_exact(self, sock: socket.socket, num_bytes: int) -> Optional[bytes]:
        """
        Receive exact number of bytes from socket.
        
        Args:
            sock: Connected socket
            num_bytes: Exact number of bytes to receive
            
        Returns:
            Bytes received or None if connection closed
        """
        data = b''
        while len(data) < num_bytes:
            chunk = sock.recv(num_bytes - len(data))
            if not chunk:
                return None  # Connection closed
            data += chunk
        return data
    
    def ping_native_host(
        self,
        timeout_ms: int = 500,
        specific_port: Optional[int] = None,
        check_websocket: bool = True
    ) -> Dict[str, Any]:
        """
        Ping the native host to verify connectivity using proper binary protocol.
        
        This method:
        1. Checks if bloom-host.exe process is running
        2. Attempts TCP connection to host port(s)
        3. Sends ping via Length-Prefix Framing and waits for response
        4. Optionally checks WebSocket port status
        
        Args:
            timeout_ms: Timeout in milliseconds for connection/response
            specific_port: If provided, only test this port; otherwise scan range
            check_websocket: If True, also verify WS port is reachable
            
        Returns:
            Dict with connection status, timing, and diagnostics
        """
        start_time = time.time()
        timeout_sec = timeout_ms / 1000.0
        
        if self.verbose:
            print(f"🔍 Starting native host ping (timeout: {timeout_ms}ms)")
        
        # Step 1: Check if host process is running
        host_running = self._is_host_process_running()
        
        if self.verbose:
            print(f"   Process check: {'✅ Running' if host_running else '❌ Not found'}")
        
        # Step 2: Find and connect to host port
        if specific_port:
            ports_to_try = [specific_port]
        else:
            ports_to_try = range(self.BASE_PORT, self.BASE_PORT + self.MAX_PORT_ATTEMPTS)
        
        connected_port = None
        response_time_ms = None
        error_message = None
        host_version = None
        
        for port in ports_to_try:
            if self.verbose:
                print(f"   Trying port {port}...")
            
            try:
                # Attempt TCP connection
                ping_start = time.time()
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(timeout_sec)
                
                try:
                    sock.connect(('127.0.0.1', port))
                    
                    if self.verbose:
                        print(f"   ✅ Connected to port {port}")
                    
                    # Send ping message using binary framing
                    ping_message = {
                        "command": "ping",
                        "source": "brain_cli",
                        "timestamp": datetime.utcnow().isoformat() + 'Z'
                    }
                    
                    self._send_message(sock, ping_message)
                    
                    # Wait for response using binary framing
                    response = self._recv_message(sock, timeout_sec)
                    
                    if response:
                        ping_end = time.time()
                        response_time_ms = int((ping_end - ping_start) * 1000)
                        
                        # Check for valid pong response
                        if response.get("status") == "pong" or response.get("command") == "pong":
                            connected_port = port
                            host_version = response.get("version", "unknown")
                            
                            if self.verbose:
                                print(f"   ✅ Received pong from port {port} ({response_time_ms}ms)")
                                if host_version != "unknown":
                                    print(f"   📦 Host version: {host_version}")
                            break
                        else:
                            if self.verbose:
                                print(f"   ⚠️  Unexpected response: {response}")
                    else:
                        if self.verbose:
                            print(f"   ⚠️  No valid response from port {port}")
                    
                except socket.timeout:
                    if self.verbose:
                        print(f"   ⏱️  Connection timeout on port {port}")
                except ConnectionRefusedError:
                    if self.verbose:
                        print(f"   ❌ Connection refused on port {port}")
                except Exception as e:
                    if self.verbose:
                        print(f"   ❌ Error during ping on port {port}: {str(e)}")
                    error_message = str(e)
                finally:
                    sock.close()
                
            except Exception as e:
                if self.verbose:
                    print(f"   ❌ Socket creation error: {str(e)}")
                error_message = str(e)
        
        # Step 3: Check WebSocket port if requested
        ws_status = "unknown"
        if check_websocket:
            ws_status = self._check_websocket_port(timeout_sec)
            if self.verbose:
                print(f"   WebSocket port ({self.WS_PORT}): {ws_status}")
        
        # Step 4: Build result
        connected = connected_port is not None
        
        if not connected:
            if not host_running:
                error_message = "Host process not found"
            elif specific_port:
                error_message = f"Port {specific_port} not responding"
            else:
                error_message = "No responding port found in range"
        
        total_time = time.time() - start_time
        
        return {
            "host_running": host_running,
            "port": connected_port,
            "connected": connected,
            "response_time_ms": response_time_ms,
            "version": host_version,
            "ws_status": ws_status,
            "error": error_message,
            "total_check_time_ms": int(total_time * 1000),
            "timestamp": datetime.utcnow().isoformat() + 'Z'
        }
    
    def _is_host_process_running(self) -> bool:
        """
        Check if bloom-host.exe process is running.
        
        Returns:
            True if process found, False otherwise
        """
        try:
            system = platform.system()
            
            if system == "Windows":
                result = subprocess.run(
                    ['tasklist', '/FI', 'IMAGENAME eq bloom-host.exe'],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                return 'bloom-host.exe' in result.stdout
            
            elif system in ["Linux", "Darwin"]:
                result = subprocess.run(
                    ['ps', 'aux'],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                return 'bloom-host' in result.stdout
            
            else:
                if self.verbose:
                    print(f"   ⚠️  Unsupported platform: {system}")
                return False
        
        except subprocess.TimeoutExpired:
            if self.verbose:
                print("   ⏱️  Process check timeout")
            return False
        except FileNotFoundError:
            if self.verbose:
                print("   ⚠️  System command not found (tasklist/ps)")
            return False
        except Exception as e:
            if self.verbose:
                print(f"   ❌ Error checking process: {e}")
            return False
    
    def _check_websocket_port(self, timeout: float) -> str:
        """
        Check if WebSocket port is reachable.
        
        Args:
            timeout: Connection timeout in seconds
            
        Returns:
            "up" if reachable, "down" if not, "unknown" on error
        """
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex(('127.0.0.1', self.WS_PORT))
            sock.close()
            
            return "up" if result == 0 else "down"
        
        except Exception as e:
            if self.verbose:
                print(f"   ⚠️  Error checking WS port: {e}")
            return "unknown"