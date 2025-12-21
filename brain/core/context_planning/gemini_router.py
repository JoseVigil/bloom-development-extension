"""
summary: Gemini-powered router for intelligent file prioritization with multi-key failover
keywords: gemini, ai, router, prioritization, context, planning, failover, multi-key

Gemini Router for Context Planning.
Uses Gemini API with automatic key rotation and failover for file prioritization.
"""

import json
import asyncio
import aiohttp
from pathlib import Path
from typing import Dict, Any, Tuple
from brain.shared.credentials import GeminiKeyManager, NoAvailableKeysError, GeminiAPIError


class GeminiRouter:
    """
    Routes context planning requests to Gemini API with intelligent failover.
    
    Uses GeminiKeyManager for automatic key rotation and quota management.
    """
    
    API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    
    def __init__(self):
        """Initialize the router with key manager."""
        self.key_manager = GeminiKeyManager()
        self._load_prompt_template()
    
    def _load_prompt_template(self) -> None:
        """Load router prompt template from file."""
        prompt_path = Path(__file__).parent / "prompts" / "router_prompt.md"
        
        if prompt_path.exists():
            self.prompt_template = prompt_path.read_text(encoding='utf-8')
        else:
            # Fallback to inline prompt
            self.prompt_template = self._get_fallback_prompt()
    
    async def create_context_plan(
        self,
        enriched_tree: str,
        intent_description: str,
        intent_type: str
    ) -> Dict[str, Any]:
        """
        Generate context plan using Gemini with automatic failover.
        
        Args:
            enriched_tree: Enriched tree string with metadata
            intent_description: User's intent description
            intent_type: Type of intent ("dev", "doc", or "seed")
            
        Returns:
            Context plan dictionary with prioritized files
            
        Raises:
            NoAvailableKeysError: If no keys available with sufficient quota
            GeminiAPIError: If API fails after all retries
            RuntimeError: If planning fails after max retries
        """
        # 1. Build prompt
        prompt = self._build_prompt(enriched_tree, intent_description, intent_type)
        
        # 2. Estimate tokens (rough estimation)
        estimated_tokens = len(prompt) // 3 + 8000  # Input tokens + output buffer
        
        # 3. Attempt with failover (max 3 retries)
        max_retries = 3
        last_error = None
        
        for attempt in range(max_retries):
            try:
                # Get available key (automatic rotation)
                profile_name, api_key = self.key_manager.get_available_key(estimated_tokens)
                
                # Call Gemini API
                response = await self._call_gemini_api(api_key, prompt)
                
                # Extract tokens used
                tokens_used = response.get("usage", {}).get("total_tokens", estimated_tokens)
                
                # Report successful usage
                self.key_manager.report_usage(profile_name, tokens_used, success=True)
                
                # Return parsed plan
                return response["context_plan"]
                
            except GeminiAPIError as e:
                last_error = e
                # Report failure
                self.key_manager.report_usage(profile_name, 0, success=False)
                
                if attempt == max_retries - 1:
                    raise RuntimeError(
                        f"Context planning failed after {max_retries} retries: {e}"
                    ) from e
                
                # Retry with another key
                await asyncio.sleep(1)  # Brief delay before retry
                continue
        
        # Should not reach here, but just in case
        raise RuntimeError(f"Context planning failed: {last_error}")
    
    def _build_prompt(
        self,
        enriched_tree: str,
        intent_description: str,
        intent_type: str
    ) -> str:
        """
        Build complete prompt for Gemini.
        
        Args:
            enriched_tree: Enriched tree with file metadata
            intent_description: User's intent
            intent_type: Type of intent
            
        Returns:
            Complete prompt string
        """
        return self.prompt_template.format(
            enriched_tree=enriched_tree,
            intent_description=intent_description,
            intent_type=intent_type
        )
    
    async def _call_gemini_api(self, api_key: str, prompt: str) -> Dict[str, Any]:
        """
        Call Gemini API with given key.
        
        Args:
            api_key: Gemini API key
            prompt: Complete prompt
            
        Returns:
            Dict with context_plan and usage metadata
            
        Raises:
            GeminiAPIError: If API call fails
        """
        request_payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192,
                "topP": 0.8,
                "topK": 40
            }
        }
        
        timeout = aiohttp.ClientTimeout(total=120)
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            try:
                async with session.post(
                    self.API_ENDPOINT,
                    params={"key": api_key},
                    json=request_payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    
                    if response.status != 200:
                        error_text = await response.text()
                        raise GeminiAPIError(
                            f"API error {response.status}: {error_text}"
                        )
                    
                    data = await response.json()
                    
                    # Parse and validate response
                    context_plan = self._parse_response(data)
                    
                    return {
                        "context_plan": context_plan,
                        "usage": data.get("usageMetadata", {})
                    }
                    
            except asyncio.TimeoutError:
                raise GeminiAPIError("API request timed out after 120s")
            except aiohttp.ClientError as e:
                raise GeminiAPIError(f"Network error: {e}")
    
    def _parse_response(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse and validate Gemini response.
        
        Args:
            response_data: Raw API response
            
        Returns:
            Parsed context plan
            
        Raises:
            ValueError: If response format is invalid
        """
        try:
            # Extract text from response
            text = response_data["candidates"][0]["content"]["parts"][0]["text"]
            
            # Clean markdown fences if present
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            
            # Parse JSON
            plan = json.loads(text)
            
            # Validate structure
            self._validate_plan(plan)
            
            return plan
            
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            raise ValueError(f"Invalid response format from Gemini: {e}")
    
    def _validate_plan(self, plan: Dict[str, Any]) -> None:
        """
        Validate context plan structure and limits.
        
        Args:
            plan: Parsed context plan
            
        Raises:
            ValueError: If plan is invalid
        """
        required_keys = ["priority_tiers", "metadata"]
        for key in required_keys:
            if key not in plan:
                raise ValueError(f"Missing required key: {key}")
        
        tiers = plan["priority_tiers"]
        required_tiers = ["critical", "high", "medium", "low", "excluded"]
        for tier in required_tiers:
            if tier not in tiers:
                raise ValueError(f"Missing tier: {tier}")
        
        # Validate limits
        if len(tiers["critical"]) > 10:
            raise ValueError(
                f"Too many CRITICAL files: {len(tiers['critical'])} (max 10)"
            )
        
        if len(tiers["high"]) > 20:
            raise ValueError(
                f"Too many HIGH priority files: {len(tiers['high'])} (max 20)"
            )
        
        if len(tiers["medium"]) > 30:
            raise ValueError(
                f"Too many MEDIUM priority files: {len(tiers['medium'])} (max 30)"
            )
        
        # Validate each file entry has required fields
        for tier_name in ["critical", "high", "medium"]:
            for entry in tiers[tier_name]:
                if not isinstance(entry, dict):
                    raise ValueError(f"Invalid entry in {tier_name}: must be dict")
                if "path" not in entry or "reason" not in entry:
                    raise ValueError(f"Entry missing path or reason in {tier_name}")
    
    def _get_fallback_prompt(self) -> str:
        """Fallback prompt template if file not found."""
        return """# Context Planning Router

You are the Context Planner for the Bloom AI system. Your task is to analyze a codebase and prioritize files for an AI intent.

## Input

**ENRICHED TREE:**
{enriched_tree}

**INTENT DESCRIPTION:**
{intent_description}

**INTENT TYPE:** {intent_type}

## Your Task

Analyze the enriched tree and prioritize files based on:
1. Files explicitly mentioned in the intent → CRITICAL
2. Files with [CORE] badge (high centrality) → HIGH priority
3. Files with relevant keywords matching intent → Consider priority
4. Files with [LARGE] badge → Lower priority unless explicitly mentioned
5. Dependencies of critical files → HIGH or MEDIUM

## Output Format

Return ONLY a JSON object with this EXACT structure:

```json
{{
  "priority_tiers": {{
    "critical": [
      {{"path": "file1.py", "reason": "Explicitly mentioned in intent"}},
      {{"path": "file2.ts", "reason": "Core module for X functionality"}}
    ],
    "high": [
      {{"path": "file3.py", "reason": "Dependency of critical file"}},
      {{"path": "file4.ts", "reason": "API layer for feature"}}
    ],
    "medium": [
      {{"path": "file5.py", "reason": "Related utility functions"}},
      {{"path": "file6.ts", "reason": "Supporting infrastructure"}}
    ],
    "low": ["file7.py", "file8.ts"],
    "excluded": ["file9.py", "file10.ts"]
  }},
  "metadata": {{
    "total_files_analyzed": 150,
    "estimated_tokens": {{
      "critical": 8500,
      "high": 12000,
      "medium": 15000,
      "total": 35500
    }},
    "reasoning": "Brief explanation of prioritization strategy",
    "focus_areas": ["directory1", "directory2"]
  }}
}}
```

## Rules

1. **Limits:** Max 10 CRITICAL, 20 HIGH, 30 MEDIUM files
2. **Token Budget:** Keep total under 40K tokens
3. **Be Selective:** Only include files truly needed for the intent
4. **Justify:** Every CRITICAL/HIGH/MEDIUM file needs a reason
5. **Exclude Aggressively:** Libraries, tests, configs unless relevant

## Priority Guidelines

- **CRITICAL**: Files that MUST be read to solve the intent
- **HIGH**: Files that significantly help understanding
- **MEDIUM**: Files that provide useful context
- **LOW**: Files that might be referenced but not essential
- **EXCLUDED**: Files irrelevant to this intent

Return ONLY the JSON, no additional text or explanation.
"""
