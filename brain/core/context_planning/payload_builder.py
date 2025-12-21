"""
summary: Builds optimized AI payloads from context plans using selective file extraction
keywords: payload, builder, context, optimization, extraction, files

Payload Builder for Context Planning.
Constructs optimized payloads by selectively extracting prioritized files.
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Optional


class PayloadBuilder:
    """
    Builds AI payloads from context plans.
    
    Selectively extracts files based on priority tiers and constructs
    optimized JSON payloads for LLM consumption.
    """
    
    def __init__(self, codebase_path: Path, docbase_path: Optional[Path] = None):
        """
        Initialize payload builder.
        
        Args:
            codebase_path: Path to .codebase.json file
            docbase_path: Optional path to .docbase.json file
        """
        self.codebase_path = codebase_path
        self.docbase_path = docbase_path
        self._codebase_data = None
        self._docbase_data = None
    
    def build_from_plan(self, context_plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build payload from context plan.
        
        Args:
            context_plan: Context plan dictionary with priority_tiers
            
        Returns:
            Payload dictionary ready for LLM
        """
        # Lazy load compressed files
        if self._codebase_data is None:
            self._load_codebase()
        
        if self.docbase_path and self._docbase_data is None:
            self._load_docbase()
        
        # Extract files by priority
        files = []
        tiers = context_plan["priority_tiers"]
        
        # Process CRITICAL tier
        for entry in tiers.get("critical", []):
            file_data = self._extract_file(entry, "critical")
            if file_data:
                files.append(file_data)
        
        # Process HIGH tier
        for entry in tiers.get("high", []):
            file_data = self._extract_file(entry, "high")
            if file_data:
                files.append(file_data)
        
        # Process MEDIUM tier
        for entry in tiers.get("medium", []):
            file_data = self._extract_file(entry, "medium")
            if file_data:
                files.append(file_data)
        
        # Calculate statistics
        stats = self._calculate_stats(files, context_plan)
        
        # Build final payload
        payload = {
            "files": files,
            "metadata": {
                "context_plan_version": context_plan.get("version", "1.0"),
                "intent_type": context_plan.get("intent_type", "unknown"),
                "total_files": len(files),
                "total_tokens": stats["total_tokens"],
                "breakdown_by_tier": stats["breakdown"],
                "focus_areas": context_plan.get("metadata", {}).get("focus_areas", [])
            }
        }
        
        return payload
    
    def _load_codebase(self) -> None:
        """Load codebase.json into memory."""
        if not self.codebase_path.exists():
            raise FileNotFoundError(f"Codebase not found: {self.codebase_path}")
        
        with open(self.codebase_path, 'r', encoding='utf-8') as f:
            self._codebase_data = json.load(f)
    
    def _load_docbase(self) -> None:
        """Load docbase.json into memory."""
        if not self.docbase_path.exists():
            raise FileNotFoundError(f"Docbase not found: {self.docbase_path}")
        
        with open(self.docbase_path, 'r', encoding='utf-8') as f:
            self._docbase_data = json.load(f)
    
    def _extract_file(
        self,
        entry: Dict[str, str],
        priority: str
    ) -> Optional[Dict[str, Any]]:
        """
        Extract a single file from compressed storage.
        
        Args:
            entry: File entry with path and reason
            priority: Priority tier (critical, high, medium)
            
        Returns:
            File data dict or None if not found
        """
        path = entry["path"]
        reason = entry.get("reason", "No reason provided")
        
        # Try codebase first
        content = self._get_file_from_source(path, self._codebase_data)
        
        # If not found, try docbase
        if content is None and self._docbase_data:
            content = self._get_file_from_source(path, self._docbase_data)
        
        if content is None:
            # File not found in either source
            return None
        
        # Extract metadata
        metadata = self._extract_metadata(path)
        
        return {
            "path": path,
            "content": content,
            "priority": priority,
            "reason": reason,
            "metadata": metadata
        }
    
    def _get_file_from_source(
        self,
        path: str,
        source_data: Dict[str, Any]
    ) -> Optional[str]:
        """
        Get file content from compressed source.
        
        Args:
            path: File path
            source_data: Codebase or docbase data
            
        Returns:
            Decompressed content or None
        """
        if not source_data:
            return None
        
        # Find file in source
        for file_entry in source_data.get("files", []):
            if file_entry["p"] == path:
                return self._decompress_content(file_entry["c"])
        
        return None
    
    def _decompress_content(self, compressed: str) -> str:
        """
        Decompress file content.
        
        Args:
            compressed: Compressed content (gz:base64)
            
        Returns:
            Decompressed string
        """
        if not compressed:
            return ""
        
        if not compressed.startswith("gz:"):
            return compressed
        
        # Decompress
        import gzip
        import base64
        
        encoded = compressed[3:]
        compressed_bytes = base64.b64decode(encoded.encode('ascii'))
        decompressed = gzip.decompress(compressed_bytes)
        return decompressed.decode('utf-8')
    
    def _extract_metadata(self, path: str) -> Dict[str, Any]:
        """
        Extract metadata for a file.
        
        Args:
            path: File path
            
        Returns:
            Metadata dict
        """
        # Try to find metadata in index
        metadata = {
            "loc": 0,
            "language": "unknown",
            "size_bytes": 0
        }
        
        # Search codebase index
        if self._codebase_data:
            for file_entry in self._codebase_data.get("files", []):
                if file_entry["p"] == path:
                    metadata["language"] = file_entry.get("l", "unknown")
                    # Estimate LOC from size (rough approximation)
                    size = file_entry.get("s", 0)
                    metadata["size_bytes"] = size
                    metadata["loc"] = size // 50  # Rough estimate
                    break
        
        # Search docbase index if not found
        if self._docbase_data and metadata["language"] == "unknown":
            for file_entry in self._docbase_data.get("files", []):
                if file_entry["p"] == path:
                    metadata["language"] = file_entry.get("l", "unknown")
                    size = file_entry.get("s", 0)
                    metadata["size_bytes"] = size
                    metadata["loc"] = size // 50
                    break
        
        return metadata
    
    def _calculate_stats(
        self,
        files: List[Dict[str, Any]],
        context_plan: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Calculate payload statistics.
        
        Args:
            files: List of file data
            context_plan: Original context plan
            
        Returns:
            Statistics dict
        """
        # Estimate tokens (rough: 1 token ≈ 4 chars)
        total_chars = sum(len(f["content"]) for f in files)
        total_tokens = total_chars // 4
        
        # Breakdown by tier
        breakdown = {
            "critical": {"count": 0, "tokens": 0},
            "high": {"count": 0, "tokens": 0},
            "medium": {"count": 0, "tokens": 0}
        }
        
        for file_data in files:
            priority = file_data["priority"]
            file_tokens = len(file_data["content"]) // 4
            
            if priority in breakdown:
                breakdown[priority]["count"] += 1
                breakdown[priority]["tokens"] += file_tokens
        
        return {
            "total_tokens": total_tokens,
            "breakdown": breakdown
        }
    
    def save_payload(self, payload: Dict[str, Any], output_path: Path) -> None:
        """
        Save payload to file.
        
        Args:
            payload: Payload dictionary
            output_path: Where to save
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
