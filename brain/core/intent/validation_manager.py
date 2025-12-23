"""
Validation manager - Pure business logic for intent validation.

This module provides validation capabilities for staged intent files,
including basic file validation and optional Gemini AI analysis.
"""

import json
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class ValidationManager:
    """
    Manager for validating intent staging files.
    
    Provides basic file validation (existence, hashes) and optional
    Gemini AI analysis for consistency, quality, and completeness checks.
    """
    
    def __init__(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ):
        """
        Initialize the ValidationManager.
        
        Args:
            intent_id: Intent UUID to validate
            folder_name: Intent folder name (alternative to intent_id)
            nucleus_path: Optional explicit path to Bloom project root
            
        Raises:
            ValueError: If neither intent_id nor folder_name provided
        """
        if not intent_id and not folder_name:
            raise ValueError("Either intent_id or folder_name must be provided")
        
        self.intent_id = intent_id
        self.folder_name = folder_name
        self.nucleus_path = nucleus_path
        self._gemini_client = None
    
    def validate(
        self,
        stage_name: Optional[str] = None,
        auto_approve: bool = False,
        skip_gemini: bool = False,
        gemini_model: str = "gemini-2.0-flash-exp",
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Validate staged files with optional Gemini analysis.
        
        Args:
            stage_name: Pipeline stage (briefing, execution, refinement_X)
            auto_approve: Skip manual review and approve automatically
            skip_gemini: Skip Gemini analysis (only basic validation)
            gemini_model: Gemini model to use for analysis
            verbose: Enable verbose logging
            
        Returns:
            Dictionary containing:
                - validated_at: ISO timestamp
                - intent_id: Intent UUID
                - intent_name: Intent name
                - stage: Pipeline stage name
                - basic_validation: Basic validation results
                - gemini_analysis: Gemini analysis results (if not skipped)
                - approved: Whether validation was approved
                - ready_for_merge: Whether ready for merge
                - report_path: Path to validation report
                
        Raises:
            FileNotFoundError: If staging directory or required files missing
            ValueError: If validation fails critically
        """
        # 1. Locate intent and staging directory
        intent_path, state_data = self._locate_intent()
        intent_uuid = state_data.get("uuid", "")
        intent_name = state_data.get("name", "unknown")
        
        # 2. Determine stage if not provided
        if not stage_name:
            stage_name = self._detect_latest_stage(intent_path)
        
        # 3. Locate .staging directory
        response_dir = self._get_response_dir(intent_path, stage_name)
        staging_dir = response_dir / ".staging"
        manifest_path = staging_dir / ".staging_manifest.json"
        
        if not staging_dir.exists():
            raise FileNotFoundError(
                f"Staging directory not found at {staging_dir}. "
                f"Run 'brain intent stage' first."
            )
        
        if not manifest_path.exists():
            raise FileNotFoundError(
                f"Staging manifest not found at {manifest_path}. "
                f"Run 'brain intent stage' first."
            )
        
        # 4. Load manifest
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        files_to_validate = manifest.get("files", [])
        
        if verbose:
            print(f"🔍 Validating {len(files_to_validate)} files...")
        
        # 5. Basic validation
        basic_validation = self._basic_validation(files_to_validate, staging_dir, verbose)
        
        # 6. Gemini analysis (optional)
        gemini_analysis = None
        if not skip_gemini:
            if verbose:
                print("🤖 Running Gemini analysis...")
            try:
                gemini_analysis = self._analyze_with_gemini(
                    files_to_validate,
                    staging_dir,
                    intent_path,
                    stage_name,
                    gemini_model,
                    verbose
                )
            except Exception as e:
                gemini_analysis = {
                    "error": str(e),
                    "skipped": True
                }
                if verbose:
                    print(f"⚠️  Gemini analysis failed: {e}")
        else:
            gemini_analysis = {"skipped": True}
        
        # 7. Determine approval status
        approved = auto_approve
        ready_for_merge = basic_validation["passed"] and (
            auto_approve or skip_gemini or 
            (gemini_analysis and gemini_analysis.get("recommendation") == "approve")
        )
        
        # 8. Generate validation report
        timestamp = datetime.now(timezone.utc).isoformat()
        report = {
            "validated_at": timestamp,
            "intent_id": intent_uuid,
            "intent_name": intent_name,
            "stage": stage_name,
            "basic_validation": basic_validation,
            "gemini_analysis": gemini_analysis,
            "approved": approved,
            "ready_for_merge": ready_for_merge
        }
        
        # 9. Save report
        report_path = response_dir / ".report.json"
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        if verbose:
            print(f"✅ Validation report saved: {report_path}")
        
        # 10. Interactive approval (if needed)
        if not auto_approve and not skip_gemini and gemini_analysis:
            approved = self._show_interactive_approval(report)
            report["approved"] = approved
            report["ready_for_merge"] = approved and basic_validation["passed"]
            
            # Update report with approval decision
            with open(report_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
        
        # Add report path to result
        report["report_path"] = str(report_path)
        
        return report
    
    def _basic_validation(
        self,
        files: List[Dict[str, Any]],
        staging_dir: Path,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Perform basic file validation (existence, hashes).
        
        Args:
            files: List of file entries from manifest
            staging_dir: Path to staging directory
            verbose: Enable verbose logging
            
        Returns:
            Dictionary with validation results
        """
        passed = True
        issues = []
        
        for file_info in files:
            target = Path(file_info["target"])
            
            # Verify existence
            if not target.exists():
                passed = False
                issues.append(f"Missing file: {target}")
                if verbose:
                    print(f"  ❌ Missing: {target}")
                continue
            
            # Verify hash if provided
            expected_hash = file_info.get("hash")
            if expected_hash:
                actual_hash = self._calculate_hash(target)
                if actual_hash != expected_hash:
                    passed = False
                    issues.append(f"Hash mismatch: {target}")
                    if verbose:
                        print(f"  ❌ Hash mismatch: {target}")
            
            if verbose and passed:
                print(f"  ✓ {target}")
        
        return {
            "passed": passed,
            "files_checked": len(files),
            "issues": issues
        }
    
    def _analyze_with_gemini(
        self,
        files: List[Dict[str, Any]],
        staging_dir: Path,
        intent_path: Path,
        stage: str,
        model: str,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Analyze staged files using Gemini AI.
        
        Args:
            files: List of file entries from manifest
            staging_dir: Path to staging directory
            intent_path: Path to intent directory
            stage: Pipeline stage name
            model: Gemini model to use
            verbose: Enable verbose logging
            
        Returns:
            Dictionary with Gemini analysis results
            
        Raises:
            Exception: If Gemini API call fails
        """
        # 1. Load context plan
        context = self._load_context_plan(intent_path, stage)
        
        # 2. Read staged files content
        files_content = {}
        for file_info in files:
            target = Path(file_info["target"])
            if target.exists():
                try:
                    with open(target, 'r', encoding='utf-8', errors='ignore') as f:
                        rel_path = target.relative_to(staging_dir.parent.parent.parent)
                        files_content[str(rel_path)] = f.read()
                except Exception as e:
                    if verbose:
                        print(f"  ⚠️  Could not read {target}: {e}")
        
        # 3. Build Gemini prompt
        prompt = self._build_gemini_prompt(context, files_content)
        
        # 4. Call Gemini
        response_text = self._call_gemini(prompt, model)
        
        # 5. Parse response
        try:
            # Try to extract JSON from response
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            
            analysis = json.loads(response_text)
            return analysis
        except json.JSONDecodeError as e:
            return {
                "error": f"Failed to parse Gemini response: {e}",
                "raw": response_text
            }
    
    def _build_gemini_prompt(
        self,
        context: Dict[str, Any],
        files_content: Dict[str, str]
    ) -> str:
        """
        Build prompt for Gemini analysis.
        
        Args:
            context: Context plan data
            files_content: Dictionary mapping file paths to content
            
        Returns:
            Formatted prompt string
        """
        return f"""You are analyzing changes for a development intent.

**Context Plan:**
{json.dumps(context, indent=2)}

**Files to Validate:**
{json.dumps(files_content, indent=2)}

**Task:**
Analyze these files and provide:
1. Consistency check: Do the changes align with the plan?
2. Quality check: Are there obvious bugs or issues?
3. Completeness check: Are all planned changes present?
4. Risk assessment: What could go wrong when applying these?

Respond ONLY in JSON format:
{{
  "consistency": {{"score": 0-100, "issues": []}},
  "quality": {{"score": 0-100, "issues": []}},
  "completeness": {{"score": 0-100, "missing": []}},
  "risks": ["risk1", "risk2"],
  "recommendation": "approve|review_needed|reject",
  "summary": "brief summary"
}}
"""
    
    def _call_gemini(self, prompt: str, model: str) -> str:
        """
        Call Gemini API with the given prompt.
        
        Args:
            prompt: Prompt text
            model: Model name to use
            
        Returns:
            Response text from Gemini
            
        Raises:
            Exception: If API call fails
        """
        try:
            import google.generativeai as genai
            
            # Get API key from environment or config
            api_key = self._get_gemini_api_key()
            genai.configure(api_key=api_key)
            
            # Create model and generate
            gemini_model = genai.GenerativeModel(model)
            response = gemini_model.generate_content(prompt)
            
            return response.text
            
        except ImportError:
            raise Exception(
                "google-generativeai package not installed. "
                "Install with: pip install google-generativeai"
            )
        except Exception as e:
            raise Exception(f"Gemini API call failed: {e}")
    
    def _show_interactive_approval(self, report: Dict[str, Any]) -> bool:
        """
        Show interactive approval prompt to user.
        
        Args:
            report: Validation report
            
        Returns:
            True if approved, False otherwise
        """
        print("\n" + "="*70)
        print("📋 VALIDATION REPORT")
        print("="*70)
        
        gemini = report.get("gemini_analysis", {})
        
        if "consistency" in gemini:
            print(f"\n✓ Consistency: {gemini['consistency']['score']}/100")
            for issue in gemini['consistency'].get('issues', []):
                print(f"  ⚠️  {issue}")
        
        if "quality" in gemini:
            print(f"\n✓ Quality: {gemini['quality']['score']}/100")
            for issue in gemini['quality'].get('issues', []):
                print(f"  ⚠️  {issue}")
        
        if "recommendation" in gemini:
            print(f"\n🎯 Recommendation: {gemini['recommendation']}")
        
        print("\n" + "="*70)
        
        try:
            response = input("\n👤 Approve and proceed to merge? [y/N]: ")
            return response.lower() == 'y'
        except (KeyboardInterrupt, EOFError):
            return False
    
    def _locate_intent(self) -> tuple[Path, Dict[str, Any]]:
        """
        Locate the intent directory and load its state.
        
        Returns:
            Tuple of (intent_path, state_data)
            
        Raises:
            FileNotFoundError: If Bloom project or intent not found
            ValueError: If intent not found
        """
        # Find Bloom project
        nucleus_path = self._find_bloom_project()
        
        # Search for intent
        intents_base = nucleus_path / ".bloom" / ".intents"
        
        if not intents_base.exists():
            raise ValueError("No intents directory found in project")
        
        # Search in both .dev and .doc
        for type_dir in [".dev", ".doc"]:
            type_path = intents_base / type_dir
            if not type_path.exists():
                continue
            
            for intent_dir in type_path.iterdir():
                if not intent_dir.is_dir():
                    continue
                
                # Check by folder name
                if self.folder_name and intent_dir.name == self.folder_name:
                    state_data = self._load_state(intent_dir)
                    return intent_dir, state_data
                
                # Check by intent_id
                if self.intent_id:
                    state_data = self._load_state(intent_dir)
                    if state_data and state_data.get("uuid") == self.intent_id:
                        return intent_dir, state_data
        
        raise ValueError(
            f"Intent not found: {self.folder_name or self.intent_id}"
        )
    
    def _find_bloom_project(self) -> Path:
        """
        Find the Bloom project root.
        
        Returns:
            Path to Bloom project root
            
        Raises:
            FileNotFoundError: If no valid Bloom project found
        """
        if self.nucleus_path:
            bloom_dir = self.nucleus_path / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return self.nucleus_path.resolve()
            raise FileNotFoundError(
                f"No valid Bloom project found at {self.nucleus_path}"
            )
        
        # Search upward from current directory
        current = Path.cwd()
        while current != current.parent:
            bloom_dir = current / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return current.resolve()
            current = current.parent
        
        raise FileNotFoundError(
            "No Bloom project found. Run from within a Bloom project "
            "or specify --nucleus-path"
        )
    
    def _load_state(self, intent_dir: Path) -> Optional[Dict[str, Any]]:
        """
        Load intent state from directory.
        
        Args:
            intent_dir: Intent directory path
            
        Returns:
            State data dictionary or None if not found
        """
        for state_name in [".dev_state.json", ".doc_state.json"]:
            state_file = intent_dir / state_name
            if state_file.exists():
                try:
                    with open(state_file, 'r', encoding='utf-8') as f:
                        return json.load(f)
                except (json.JSONDecodeError, IOError):
                    continue
        return None
    
    def _detect_latest_stage(self, intent_path: Path) -> str:
        """
        Detect the latest pipeline stage.
        
        Args:
            intent_path: Intent directory path
            
        Returns:
            Stage name (briefing, execution, or refinement_X)
        """
        pipeline_dir = intent_path / ".pipeline"
        
        # Check refinement stages
        refinement_dir = pipeline_dir / ".refinement"
        if refinement_dir.exists():
            turns = sorted([
                d for d in refinement_dir.iterdir() 
                if d.is_dir() and d.name.startswith(".turn_")
            ])
            if turns:
                latest_turn = turns[-1].name.replace(".turn_", "")
                return f"refinement_{latest_turn}"
        
        # Check execution
        execution_dir = pipeline_dir / ".execution"
        if execution_dir.exists() and (execution_dir / ".response").exists():
            return "execution"
        
        # Default to briefing
        return "briefing"
    
    def _get_response_dir(self, intent_path: Path, stage: str) -> Path:
        """
        Get the response directory for a given stage.
        
        Args:
            intent_path: Intent directory path
            stage: Stage name
            
        Returns:
            Path to response directory
            
        Raises:
            FileNotFoundError: If response directory not found
        """
        pipeline_dir = intent_path / ".pipeline"
        
        if stage.startswith("refinement_"):
            turn_num = stage.replace("refinement_", "")
            response_dir = pipeline_dir / ".refinement" / f".turn_{turn_num}" / ".response"
        elif stage == "execution":
            response_dir = pipeline_dir / ".execution" / ".response"
        else:  # briefing
            response_dir = pipeline_dir / ".briefing" / ".response"
        
        if not response_dir.exists():
            raise FileNotFoundError(
                f"Response directory not found: {response_dir}"
            )
        
        return response_dir
    
    def _load_context_plan(
        self,
        intent_path: Path,
        stage: str
    ) -> Dict[str, Any]:
        """
        Load context plan for the stage.
        
        Args:
            intent_path: Intent directory path
            stage: Stage name
            
        Returns:
            Context plan dictionary
        """
        response_dir = self._get_response_dir(intent_path, stage)
        plan_path = response_dir / ".context_dev_plan.json"
        
        if plan_path.exists():
            with open(plan_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {}
    
    def _calculate_hash(self, file_path: Path) -> str:
        """
        Calculate MD5 hash of a file.
        
        Args:
            file_path: Path to file
            
        Returns:
            MD5 hash string
        """
        hash_md5 = hashlib.md5()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    
    def _get_gemini_api_key(self) -> str:
        """
        Get Gemini API key from environment or config.
        
        Returns:
            API key string
            
        Raises:
            ValueError: If API key not found
        """
        import os
        
        # Try environment variable first
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            return api_key
        
        # Try loading from Brain config
        try:
            from brain.core.gemini.keys_manager import KeysManager
            manager = KeysManager()
            keys = manager.list_keys()
            if keys:
                # Get first available key
                return keys[0].get("key", "")
        except:
            pass
        
        raise ValueError(
            "No Gemini API key found. Set GEMINI_API_KEY environment variable "
            "or add a key with 'brain gemini keys-add'"
        )