"""
Download Manager - Core logic for receiving and processing AI responses.

This module handles downloading AI responses via TCP socket or file input,
validates the Bloom protocol format, and extracts files to the proper
directory structure.
"""

import json
import socket
import struct
import copy
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class DownloadManager:
    """
    Manager for downloading and processing AI responses.
    
    This class handles receiving AI responses through the Native Host bridge
    or from files, validates them against the Bloom protocol, and saves them
    to the correct directory structure with file extraction.
    """
    
    BLOOM_PROTOCOL_VERSION = "1.0"
    
    def __init__(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ):
        """
        Initialize the DownloadManager.
        
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent (alternative to intent_id)
            nucleus_path: Path to Bloom project root (auto-detected if None)
            
        Raises:
            ValueError: If neither intent_id nor folder_name is provided
            FileNotFoundError: If Bloom project or intent not found
        """
        if not intent_id and not folder_name:
            raise ValueError("Must provide either intent_id or folder_name")
        
        self.intent_id = intent_id
        self.folder_name = folder_name
        self.nucleus_path = self._find_bloom_project(nucleus_path)
        self.intent_path, self.state_data, self.state_file = self._locate_intent()
        
    def _find_bloom_project(self, start_path: Optional[Path] = None) -> Path:
        """
        Find the Bloom project root by looking for .bloom directory.
        
        Args:
            start_path: Starting path for search (current dir if None)
            
        Returns:
            Path to Bloom project root
            
        Raises:
            FileNotFoundError: If Bloom project not found
        """
        current = Path(start_path or Path.cwd()).resolve()
        
        while current != current.parent:
            bloom_dir = current / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return current
            current = current.parent
        
        raise FileNotFoundError(
            "Bloom project not found. Run this command from within a Bloom project."
        )
    
    def _locate_intent(self) -> tuple[Path, Dict[str, Any], Path]:
        """
        Locate the intent directory and load its state.
        
        Returns:
            Tuple of (intent_path, state_data, state_file)
            
        Raises:
            FileNotFoundError: If intent not found
            ValueError: If intent state is invalid
        """
        intents_base = self.nucleus_path / ".bloom" / ".intents"
        
        # Search in both .dev and .doc directories
        for intent_type in [".dev", ".doc"]:
            type_dir = intents_base / intent_type
            if not type_dir.exists():
                continue
            
            for intent_dir in type_dir.iterdir():
                if not intent_dir.is_dir():
                    continue
                
                # Determine state file name
                state_file = intent_dir / (
                    ".dev_state.json" if intent_type == ".dev" else ".doc_state.json"
                )
                
                if not state_file.exists():
                    continue
                
                try:
                    with open(state_file, "r", encoding="utf-8") as f:
                        state_data = json.load(f)
                    
                    # Match by intent_id or folder_name
                    if self.intent_id and state_data.get("uuid") == self.intent_id:
                        return intent_dir, state_data, state_file
                    
                    if self.folder_name and intent_dir.name == self.folder_name:
                        return intent_dir, state_data, state_file
                        
                except (json.JSONDecodeError, IOError):
                    continue
        
        raise FileNotFoundError(
            f"Intent not found: {self.intent_id or self.folder_name}"
        )
    
    def download_from_socket(
        self,
        host: str,
        port: int,
        timeout: int,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Listen on TCP socket for response from Native Host.
        
        Protocol:
        1. Accept connection
        2. Read 4-byte header (Little Endian) containing message size
        3. Read full message payload
        4. Parse JSON response
        
        Args:
            host: IP address to listen on
            port: Port to listen on
            timeout: Socket timeout in seconds
            verbose: Whether to print progress messages
            
        Returns:
            Parsed response dictionary
            
        Raises:
            ConnectionError: If connection fails or is interrupted
            TimeoutError: If timeout is reached
            json.JSONDecodeError: If response is not valid JSON
        """
        server = None
        client = None
        
        try:
            # Create and configure server socket
            server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind((host, port))
            server.listen(1)
            server.settimeout(timeout)
            
            # Accept connection
            client, addr = server.accept()
            
            if verbose:
                print(f"✅ Connection from {addr[0]}:{addr[1]}")
            
            # Read 4-byte header with message size
            size_bytes = self._recv_exact(client, 4)
            message_size = struct.unpack('<I', size_bytes)[0]
            
            if verbose:
                print(f"📦 Receiving {message_size:,} bytes...")
            
            # Read full payload
            payload = self._recv_exact(client, message_size)
            
            # Parse JSON
            response = json.loads(payload.decode('utf-8'))
            
            return response
            
        except socket.timeout:
            raise TimeoutError(
                f"No response received within {timeout} seconds. "
                f"Is the Native Host running and sending data?"
            )
        except ConnectionResetError:
            raise ConnectionError("Connection was reset by the Native Host")
        except struct.error as e:
            raise ConnectionError(f"Invalid message header format: {e}")
        except json.JSONDecodeError as e:
            raise json.JSONDecodeError(
                f"Response is not valid JSON: {e.msg}",
                e.doc,
                e.pos
            )
        finally:
            # Clean up sockets
            if client:
                client.close()
            if server:
                server.close()
    
    def _recv_exact(self, sock: socket.socket, num_bytes: int) -> bytes:
        """
        Receive exactly num_bytes from socket.
        
        Args:
            sock: Socket to receive from
            num_bytes: Number of bytes to receive
            
        Returns:
            Received bytes
            
        Raises:
            ConnectionError: If connection closes prematurely
        """
        chunks = []
        received = 0
        
        while received < num_bytes:
            chunk = sock.recv(min(8192, num_bytes - received))
            if not chunk:
                raise ConnectionError(
                    f"Connection closed prematurely. "
                    f"Expected {num_bytes} bytes, got {received}"
                )
            chunks.append(chunk)
            received += len(chunk)
        
        return b''.join(chunks)
    
    def download_from_file(self, file_path: Path) -> Dict[str, Any]:
        """
        Read response from a JSON file (for testing).
        
        Args:
            file_path: Path to JSON file containing response
            
        Returns:
            Parsed response dictionary
            
        Raises:
            FileNotFoundError: If file doesn't exist
            json.JSONDecodeError: If file is not valid JSON
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Response file not found: {file_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            raise json.JSONDecodeError(
                f"Invalid JSON in file {file_path}: {e.msg}",
                e.doc,
                e.pos
            )
    
    def save_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save response to disk with proper structure and file extraction.
        
        Directory structure created:
        .pipeline/{stage}/.response/
        ├── .raw_output.json     # Full response metadata
        └── .files/              # Extracted files
            ├── 001_file1.py
            ├── 002_file2.ts
            └── ...
        
        Args:
            response: Response dictionary from AI
            
        Returns:
            Dictionary with save operation results
            
        Raises:
            ValueError: If response doesn't conform to Bloom protocol
        """
        # 1. Validate protocol
        self.validate_protocol(response)
        
        # 2. Get pipeline stage
        stage = response["bloom_protocol"]["pipeline_stage"]
        
        # 3. Create directory structure
        response_dir = self._get_response_dir(stage)
        response_dir.mkdir(parents=True, exist_ok=True)
        
        files_dir = response_dir / ".files"
        files_dir.mkdir(exist_ok=True)
        
        # 4. Save raw output (without file contents to keep it lean)
        raw_output_path = response_dir / ".raw_output.json"
        raw_output = self._prepare_raw_output(response)
        
        with open(raw_output_path, 'w', encoding='utf-8') as f:
            json.dump(raw_output, f, indent=2, ensure_ascii=False)
        
        # 5. Extract and save files
        files_saved, file_list = self._extract_files(response, files_dir)
        
        # 6. Update intent state
        self._update_intent_state(response, stage, files_saved)
        
        # 7. Return results
        return {
            "intent_id": self.state_data.get("uuid", "unknown"),
            "stage": stage,
            "raw_output_path": str(raw_output_path),
            "files_dir": str(files_dir),
            "files_saved": files_saved,
            "file_list": file_list,
            "completion_status": response["bloom_protocol"]["completion_status"]
        }
    
    def validate_protocol(self, response: Dict[str, Any]) -> None:
        """
        Validate that response conforms to Bloom protocol v1.0.
        
        Required structure:
        {
          "bloom_protocol": {
            "version": "1.0",
            "pipeline_stage": "...",
            "completion_status": "...",
            "downloaded_at": "..."
          },
          "metadata": {...},
          "content": {...}
        }
        
        Args:
            response: Response dictionary to validate
            
        Raises:
            ValueError: If response doesn't conform to protocol
        """
        # Check top-level keys
        required_keys = ["bloom_protocol", "metadata", "content"]
        missing_keys = [k for k in required_keys if k not in response]
        
        if missing_keys:
            raise ValueError(
                f"Invalid Bloom protocol: missing keys {missing_keys}"
            )
        
        # Check bloom_protocol section
        protocol = response["bloom_protocol"]
        
        if protocol.get("version") != self.BLOOM_PROTOCOL_VERSION:
            raise ValueError(
                f"Unsupported protocol version: {protocol.get('version')}. "
                f"Expected {self.BLOOM_PROTOCOL_VERSION}"
            )
        
        if "pipeline_stage" not in protocol:
            raise ValueError("Invalid protocol: missing pipeline_stage")
        
        if "completion_status" not in protocol:
            raise ValueError("Invalid protocol: missing completion_status")
        
        # Validate stage value
        valid_stages = ["briefing", "analysis", "implementation", "review"]
        if protocol["pipeline_stage"] not in valid_stages:
            raise ValueError(
                f"Invalid pipeline_stage: {protocol['pipeline_stage']}. "
                f"Must be one of {valid_stages}"
            )
    
    def _get_response_dir(self, stage: str) -> Path:
        """
        Get the response directory path for a given pipeline stage.
        
        Args:
            stage: Pipeline stage name
            
        Returns:
            Path to .response directory
        """
        return self.intent_path / ".pipeline" / f".{stage}" / ".response"
    
    def _prepare_raw_output(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare raw output by removing embedded file contents.
        
        We keep the metadata but remove the actual file contents to keep
        the raw_output.json file lean. The actual files are saved separately.
        
        Args:
            response: Full response dictionary
            
        Returns:
            Response with file contents removed
        """
        raw_output = copy.deepcopy(response)
        
        # Remove file contents if present
        if "content" in raw_output and "files" in raw_output["content"]:
            for file_meta in raw_output["content"]["files"]:
                # Keep metadata, remove content
                if "_bloom_content" in file_meta:
                    file_meta["_bloom_content"] = "<extracted>"
        
        return raw_output
    
    def _extract_files(
        self,
        response: Dict[str, Any],
        files_dir: Path
    ) -> tuple[int, List[str]]:
        """
        Extract embedded files from response and save to .files/ directory.
        
        The response structure is expected to have files in:
        response["content"]["files"] = [
          {
            "file_ref": "001_src_file.py",
            "metadata": {...},
            "_bloom_content": "file content here"
          }
        ]
        
        Args:
            response: Full response dictionary
            files_dir: Directory to save files to
            
        Returns:
            Tuple of (files_saved_count, list_of_filenames)
        """
        files = response.get("content", {}).get("files", [])
        count = 0
        file_list = []
        
        for file_meta in files:
            if not isinstance(file_meta, dict):
                continue
            
            file_ref = file_meta.get("file_ref")
            content = file_meta.get("_bloom_content", "")
            
            if not file_ref or not content:
                continue
            
            # Save file
            file_path = files_dir / file_ref
            
            # Ensure parent directories exist
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                count += 1
                file_list.append(file_ref)
            except IOError as e:
                # Log warning but continue with other files
                print(f"⚠️ Warning: Could not save file {file_ref}: {e}")
        
        return count, file_list
    
    def _update_intent_state(
        self,
        response: Dict[str, Any],
        stage: str,
        files_count: int
    ) -> None:
        """
        Update intent state file with download information.
        
        Args:
            response: Full response dictionary
            stage: Pipeline stage
            files_count: Number of files extracted
        """
        # Update download information
        self.state_data["last_download"] = {
            "timestamp": response["bloom_protocol"].get(
                "downloaded_at",
                datetime.now(timezone.utc).isoformat()
            ),
            "stage": stage,
            "files_count": files_count,
            "completion_status": response["bloom_protocol"]["completion_status"]
        }
        
        # Update steps tracking if present
        if "steps" in self.state_data:
            self.state_data["steps"]["download"] = True
        
        # Save updated state
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(self.state_data, f, indent=2, ensure_ascii=False)
    
    def acquire_download_lock(self, response: Dict[str, Any]) -> None:
        """
        Acquire lock before downloading (prevents concurrent operations).
        
        Updates .dev_state.json to indicate download in progress.
        
        Args:
            response: Response dictionary (for recovery data)
            
        Raises:
            RuntimeError: If intent is already locked
        """
        if self.state_data.get("lock", {}).get("locked", False):
            locked_by = self.state_data["lock"].get("locked_by", "unknown")
            raise RuntimeError(f"Intent is locked by {locked_by}")
        
        # Set lock
        self.state_data["lock"] = {
            "locked": True,
            "locked_by": "brain_download_v1.0",
            "locked_at": datetime.now(timezone.utc).isoformat(),
            "operation": "downloading_response",
            "recovery_data": {
                "chat_url": response.get("metadata", {}).get("conversation_url", ""),
                "profile": response.get("metadata", {}).get("profile_used", ""),
                "stage": response["bloom_protocol"]["pipeline_stage"]
            }
        }
        
        # Save state
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(self.state_data, f, indent=2, ensure_ascii=False)
    
    def release_download_lock(self) -> None:
        """
        Release lock after successful download.
        """
        if "lock" in self.state_data:
            self.state_data["lock"]["locked"] = False
            self.state_data["lock"]["locked_by"] = None
            
            # Save state
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(self.state_data, f, indent=2, ensure_ascii=False)