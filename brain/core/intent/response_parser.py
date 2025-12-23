"""
Response parser core logic - Pure business logic for parsing AI responses.

This module contains the core logic for parsing and validating AI response
files according to the Bloom protocol. It has no CLI dependencies and can
be used independently in tests or other contexts.
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List


class ResponseParser:
    """
    Parser for AI response files following the Bloom protocol.
    
    This class handles:
    - Locating .raw_output.json files in intent pipeline stages
    - Validating Bloom protocol structure and version
    - Checking file references exist in .files directory
    - Analyzing completion status and recommended actions
    - Detecting questions that require user input
    - Generating comprehensive parse reports
    """
    
    def __init__(self, intent_id: str, nucleus_path: Path):
        """
        Initialize the response parser.
        
        Args:
            intent_id: UUID of the intent to parse
            nucleus_path: Path to the nucleus root directory
            
        Raises:
            ValueError: If intent_id is empty
            FileNotFoundError: If nucleus_path doesn't exist
        """
        if not intent_id:
            raise ValueError("intent_id cannot be empty")
        
        if not nucleus_path.exists():
            raise FileNotFoundError(f"Nucleus path does not exist: {nucleus_path}")
        
        self.intent_id = intent_id
        self.nucleus_path = nucleus_path
        self.intent_path = self._resolve_intent_path()
        self.errors: List[str] = []
        self.warnings: List[str] = []
    
    def _resolve_intent_path(self) -> Path:
        """
        Resolve the path to the intent directory.
        
        Returns:
            Path to the intent directory
            
        Raises:
            FileNotFoundError: If intent directory doesn't exist
        """
        # Try common patterns
        patterns = [
            self.nucleus_path / ".bloom" / ".intents" / ".dev" / self.intent_id,
            self.nucleus_path / ".bloom" / ".intents" / self.intent_id,
            self.nucleus_path / ".intents" / self.intent_id
        ]
        
        for pattern in patterns:
            if pattern.exists():
                return pattern
        
        raise FileNotFoundError(
            f"Intent directory not found for ID: {self.intent_id}. "
            f"Searched in: {[str(p) for p in patterns]}"
        )
    
    def _detect_latest_stage(self) -> str:
        """
        Auto-detect the latest pipeline stage with a .raw_output.json.
        
        Returns:
            Stage name (e.g., 'briefing', 'execution', 'refinement_1')
            
        Raises:
            FileNotFoundError: If no stages found
        """
        pipeline_path = self.intent_path / ".pipeline"
        
        if not pipeline_path.exists():
            raise FileNotFoundError(f"Pipeline directory not found: {pipeline_path}")
        
        # Check stages in order
        stage_order = ["briefing", "execution"]
        
        # Add refinement stages
        for i in range(1, 10):
            stage_order.append(f"refinement_{i}")
        
        # Find the last stage with .raw_output.json
        found_stage = None
        for stage in stage_order:
            stage_path = pipeline_path / f".{stage}" / ".response" / ".raw_output.json"
            if stage_path.exists():
                found_stage = stage
        
        if not found_stage:
            raise FileNotFoundError(
                f"No .raw_output.json found in any pipeline stage. "
                f"Checked: {', '.join(stage_order)}"
            )
        
        return found_stage
    
    def _get_raw_output_path(self, stage: str) -> Path:
        """
        Get the path to .raw_output.json for a specific stage.
        
        Args:
            stage: Pipeline stage name
            
        Returns:
            Path to .raw_output.json
        """
        return (
            self.intent_path / 
            ".pipeline" / 
            f".{stage}" / 
            ".response" / 
            ".raw_output.json"
        )
    
    def parse(
        self, 
        stage: Optional[str] = None, 
        strict: bool = False,
        generate_report: bool = True
    ) -> Dict[str, Any]:
        """
        Parse .raw_output.json and validate protocol.
        
        Args:
            stage: Pipeline stage to parse (auto-detect if None)
            strict: Fail on any protocol violation if True
            generate_report: Generate .parse_report.json if True
            
        Returns:
            Dictionary containing parse results with keys:
            - parsed_at: ISO timestamp
            - intent_id: Intent UUID
            - stage: Pipeline stage name
            - protocol_validation: Validation results
            - files_validation: File reference validation
            - completion_analysis: Completion status analysis
            - questions_analysis: Questions detection
            - errors: List of errors
            - warnings: List of warnings
            - report_path: Path to generated report (if generate_report=True)
            
        Raises:
            FileNotFoundError: If .raw_output.json not found
            ValueError: If protocol validation fails in strict mode
            json.JSONDecodeError: If JSON is malformed
        """
        # 1. Detect or validate stage
        if not stage:
            stage = self._detect_latest_stage()
        
        # 2. Locate .raw_output.json
        raw_path = self._get_raw_output_path(stage)
        
        if not raw_path.exists():
            raise FileNotFoundError(
                f".raw_output.json not found for stage '{stage}': {raw_path}"
            )
        
        # 3. Read JSON
        with open(raw_path, 'r', encoding='utf-8') as f:
            response = json.load(f)
        
        # 4. Protocol validation
        protocol_validation = self._validate_protocol(response, strict)
        
        if not protocol_validation["valid"] and strict:
            raise ValueError(
                f"Protocol validation failed in strict mode: "
                f"{', '.join(protocol_validation['errors'])}"
            )
        
        # 5. Files validation
        files_dir = raw_path.parent / ".files"
        files_validation = self._validate_files(response, files_dir)
        
        # 6. Completion analysis
        completion_analysis = self._analyze_completion(response)
        
        # 7. Questions detection
        questions_analysis = self._analyze_questions(response)
        
        # 8. Build report
        report = {
            "parsed_at": datetime.now().isoformat(),
            "intent_id": self.intent_id,
            "stage": stage,
            "protocol_validation": protocol_validation,
            "files_validation": files_validation,
            "completion_analysis": completion_analysis,
            "questions_analysis": questions_analysis,
            "errors": self.errors,
            "warnings": self.warnings
        }
        
        # 9. Save report if requested
        if generate_report:
            report_path = raw_path.parent / ".parse_report.json"
            with open(report_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            
            report["report_path"] = report_path
        
        return report
    
    def _validate_protocol(self, response: dict, strict: bool) -> Dict[str, Any]:
        """
        Validate Bloom protocol structure and version.
        
        Args:
            response: Parsed JSON response
            strict: Fail on warnings if True
            
        Returns:
            Dictionary with validation results:
            - valid: Boolean indicating if protocol is valid
            - errors: List of error messages
            - warnings: List of warning messages
        """
        errors = []
        warnings = []
        
        # Check bloom_protocol section exists
        if "bloom_protocol" not in response:
            errors.append("Missing required section: bloom_protocol")
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        bloom = response["bloom_protocol"]
        
        # Validate version
        version = bloom.get("version")
        if version != "1.0":
            errors.append(f"Invalid protocol version: {version} (expected 1.0)")
        
        # Validate required fields in bloom_protocol
        required_bloom_fields = ["version", "intent_id", "completion_status"]
        for field in required_bloom_fields:
            if field not in bloom:
                errors.append(f"Missing required field: bloom_protocol.{field}")
        
        # Validate intent_id matches
        if bloom.get("intent_id") != self.intent_id:
            warnings.append(
                f"Intent ID mismatch: expected {self.intent_id}, "
                f"got {bloom.get('intent_id')}"
            )
        
        # Validate metadata section
        if "metadata" not in response:
            errors.append("Missing required section: metadata")
        else:
            metadata = response["metadata"]
            required_metadata_fields = ["ai_provider", "conversation_id"]
            for field in required_metadata_fields:
                if field not in metadata:
                    errors.append(f"Missing required field: metadata.{field}")
        
        # Validate content section
        if "content" not in response:
            errors.append("Missing required section: content")
        else:
            content = response["content"]
            required_content_fields = ["type", "files"]
            for field in required_content_fields:
                if field not in content:
                    errors.append(f"Missing required field: content.{field}")
        
        # Validate completion_status value
        valid_statuses = [
            "complete", 
            "partial", 
            "token_limit", 
            "continuity_prompt", 
            "error"
        ]
        status = bloom.get("completion_status")
        if status and status not in valid_statuses:
            warnings.append(
                f"Unknown completion_status: {status}. "
                f"Valid values: {', '.join(valid_statuses)}"
            )
        
        # Validate checksum if present
        if "validation" in response:
            validation = response["validation"]
            if "checksum" in validation:
                declared_checksum = validation["checksum"]
                calculated_checksum = self._calculate_checksum(response)
                if declared_checksum != calculated_checksum:
                    warnings.append(
                        f"Checksum mismatch: declared={declared_checksum}, "
                        f"calculated={calculated_checksum}"
                    )
        
        # Store in instance
        self.errors.extend(errors)
        self.warnings.extend(warnings)
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def _validate_files(self, response: dict, files_dir: Path) -> Dict[str, Any]:
        """
        Validate that all referenced files exist in .files directory.
        
        Args:
            response: Parsed JSON response
            files_dir: Path to .files directory
            
        Returns:
            Dictionary with file validation results:
            - total: Total number of files referenced
            - found: Number of files found
            - missing: Number of missing files
            - missing_files: List of missing file references
        """
        content = response.get("content", {})
        files_meta = content.get("files", [])
        
        missing = []
        found = []
        
        for file in files_meta:
            file_ref = file.get("file_ref")
            if not file_ref:
                missing.append("(no file_ref)")
                continue
            
            file_path = files_dir / file_ref
            if file_path.exists():
                found.append(file_ref)
            else:
                missing.append(file_ref)
                self.warnings.append(f"Referenced file not found: {file_ref}")
        
        return {
            "total": len(files_meta),
            "found": len(found),
            "missing": len(missing),
            "missing_files": missing
        }
    
    def _analyze_completion(self, response: dict) -> Dict[str, Any]:
        """
        Analyze completion status and recommend actions.
        
        Args:
            response: Parsed JSON response
            
        Returns:
            Dictionary with completion analysis:
            - status: Completion status value
            - is_complete: Boolean indicating if complete
            - requires_action: Boolean indicating if action needed
            - recommended_action: Suggested next action (or None)
        """
        bloom = response.get("bloom_protocol", {})
        status = bloom.get("completion_status", "unknown")
        
        analysis = {
            "status": status,
            "is_complete": status == "complete",
            "requires_action": False,
            "recommended_action": None
        }
        
        # Determine if action required
        if status == "token_limit":
            analysis["requires_action"] = True
            analysis["recommended_action"] = "rotate_ai_provider"
        
        elif status == "partial":
            analysis["requires_action"] = True
            analysis["recommended_action"] = "recovery_or_retry"
        
        elif status == "continuity_prompt":
            analysis["requires_action"] = True
            analysis["recommended_action"] = "submit_continuity_to_new_provider"
        
        elif status == "error":
            analysis["requires_action"] = True
            analysis["recommended_action"] = "review_error_and_retry"
        
        return analysis
    
    def _analyze_questions(self, response: dict) -> Dict[str, Any]:
        """
        Analyze questions section to detect user input requirements.
        
        Args:
            response: Parsed JSON response
            
        Returns:
            Dictionary with questions analysis:
            - has_questions: Boolean indicating if questions present
            - count: Number of questions
            - auto_answerable: Boolean indicating if auto-answerable
            - requires_user_input: Boolean indicating if user input needed
        """
        questions = response.get("questions", {})
        
        has_questions = questions.get("has_questions", False)
        count = questions.get("count", 0)
        auto_answerable = questions.get("auto_answerable", False)
        
        return {
            "has_questions": has_questions,
            "count": count,
            "auto_answerable": auto_answerable,
            "requires_user_input": has_questions and not auto_answerable
        }
    
    def _calculate_checksum(self, response: dict) -> str:
        """
        Calculate SHA-256 checksum for response content.
        
        Args:
            response: Parsed JSON response
            
        Returns:
            Hex-encoded SHA-256 checksum
        """
        # Create a copy without validation section for checksum calculation
        response_copy = response.copy()
        response_copy.pop("validation", None)
        
        # Serialize to JSON in canonical form
        json_str = json.dumps(
            response_copy, 
            sort_keys=True, 
            ensure_ascii=False
        )
        
        # Calculate SHA-256
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()