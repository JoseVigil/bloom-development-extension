"""
Chrome network log analyzer - Pure business logic.
Parses and filters Chrome's --log-net-log JSON output.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, Set
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class NetLogAnalyzer:
    """
    Analyzes Chrome network logs with AI-focused filtering.
    Parses JSON net-log format and extracts relevant events.
    """
    
    # AI service domains for intelligent filtering
    AI_DOMAINS = {
        'openai.com', 'api.openai.com', 'chat.openai.com',
        'anthropic.com', 'api.anthropic.com', 'claude.ai',
        'gemini.google.com', 'generativelanguage.googleapis.com',
        'cohere.ai', 'api.cohere.ai',
        'huggingface.co', 'api-inference.huggingface.co',
        'mistral.ai', 'api.mistral.ai',
        'perplexity.ai', 'api.perplexity.ai'
    }
    
    # Common tracking/analytics domains to exclude by default
    NOISE_PATTERNS = {
        'google-analytics', 'googletagmanager', 'doubleclick',
        'facebook.com/tr', 'connect.facebook.net',
        'analytics.', 'tracking.', 'telemetry.',
        'ads.', 'adservice.', 'pixel.'
    }
    
    def __init__(self):
        """Initialize network log analyzer."""
        from brain.core.profile.path_resolver import PathResolver
        self.paths = PathResolver()
        logger.debug(f"Initialized NetLogAnalyzer with base_dir: {self.paths.base_dir}")
    
    def analyze(
        self,
        profile_id: str,
        filter_ai: bool = False,
        exclude_patterns: Optional[List[str]] = None,
        include_quic: bool = False,
        show_headers: bool = False
    ) -> Dict[str, Any]:
        """
        Analyze Chrome network log with intelligent filtering.
        
        Args:
            profile_id: Chrome profile UUID
            filter_ai: If True, only show AI service requests
            exclude_patterns: Additional URL patterns to exclude
            include_quic: If True, include QUIC packet events
            show_headers: If True, extract HTTP/2 headers
            
        Returns:
            Dictionary with analysis results and metadata
            
        Raises:
            FileNotFoundError: If source log file doesn't exist
            ValueError: If profile_id is empty or JSON is invalid
        """
        if not profile_id or not profile_id.strip():
            raise ValueError("profile_id cannot be empty")
        
        # Construct source file path (assuming net-log is saved as netlog.json)
        source_file = Path(self.paths.base_dir) / "profiles" / profile_id / "network_mining.json"

        logger.debug(f"Source file: {source_file}")
        
        if not source_file.exists():
            logger.error(f"Network log file not found: {source_file}")
            raise FileNotFoundError(f"Chrome network log not found: {source_file}")
        
        # Construct output directory and file
        output_dir = Path(self.paths.base_dir) / "logs" / "profiles" / profile_id
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d")
        output_file = output_dir / f"chrome_bloom_net_log_{timestamp}.log"
        
        logger.info(f"Analyzing network log: {source_file}")
        logger.info(f"Output will be saved to: {output_file}")
        
        # Parse JSON
        try:
            with open(source_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in network log: {e}")
            raise ValueError(f"Invalid JSON format: {e}")
        
        # Extract constants for event type mapping
        constants = data.get('constants', {})
        event_types = {v: k for k, v in constants.get('eventType', {}).items()}
        source_types = {v: k for k, v in constants.get('sourceType', {}).items()}
        
        logger.debug(f"Event types available: {len(event_types)}")
        logger.debug(f"Source types available: {len(source_types)}")
        
        # Process events
        events = data.get('events', [])
        logger.info(f"Total events in log: {len(events)}")
        
        # Prepare exclusion patterns
        exclude_set = set(exclude_patterns or [])
        exclude_set.update(self.NOISE_PATTERNS)
        
        # Statistics
        stats = {
            'total_events': len(events),
            'url_requests': 0,
            'http2_sessions': 0,
            'quic_packets': 0,
            'ai_requests': 0
        }
        
        filtered_requests = []
        
        with open(output_file, 'w', encoding='utf-8') as f_out:
            f_out.write(f"Chrome Network Log Analysis\n")
            f_out.write(f"Profile: {profile_id}\n")
            f_out.write(f"Timestamp: {datetime.now().isoformat()}\n")
            f_out.write(f"Filter AI: {filter_ai}\n")
            f_out.write(f"Include QUIC: {include_quic}\n")
            f_out.write("=" * 80 + "\n\n")
            
            for event in events:
                event_type = event_types.get(event.get('type'), 'UNKNOWN')
                source_type = source_types.get(event.get('source', {}).get('type'), 'UNKNOWN')
                
                # Process URL requests
                if event_type == "URL_REQUEST_START_JOB":
                    stats['url_requests'] += 1
                    
                    params = event.get('params', {})
                    url = params.get('url', 'N/A')
                    method = params.get('method', 'GET')
                    
                    # Check exclusions
                    if self._should_exclude(url, exclude_set):
                        logger.debug(f"Excluded URL: {url}")
                        continue
                    
                    # Check AI filter
                    if filter_ai and not self._is_ai_service(url):
                        continue
                    
                    if filter_ai:
                        stats['ai_requests'] += 1
                    
                    # Write to output
                    f_out.write(f"[URL REQUEST] {method} -> {url}\n")
                    
                    filtered_requests.append({
                        'method': method,
                        'url': url,
                        'timestamp': event.get('time', 'N/A')
                    })
                
                # Process HTTP/2 headers
                elif event_type == "HTTP2_SESSION_RECV_HEADERS" and show_headers:
                    stats['http2_sessions'] += 1
                    
                    params = event.get('params', {})
                    headers = params.get('headers', [])
                    
                    f_out.write(f"[HTTP/2 HEADERS]\n")
                    for header in headers:
                        f_out.write(f"  {header}\n")
                    f_out.write("\n")
                
                # Process QUIC packets
                elif event_type == "QUIC_SESSION_PACKET_SENT" and include_quic:
                    stats['quic_packets'] += 1
                    
                    params = event.get('params', {})
                    f_out.write(f"[QUIC PACKET] Size: {params.get('size', 'N/A')} bytes\n")
            
            # Write summary
            f_out.write("\n" + "=" * 80 + "\n")
            f_out.write("SUMMARY\n")
            f_out.write("=" * 80 + "\n")
            f_out.write(f"Total events processed: {stats['total_events']}\n")
            f_out.write(f"URL requests: {stats['url_requests']}\n")
            f_out.write(f"HTTP/2 sessions: {stats['http2_sessions']}\n")
            f_out.write(f"QUIC packets: {stats['quic_packets']}\n")
            if filter_ai:
                f_out.write(f"AI service requests: {stats['ai_requests']}\n")
        
        logger.info(f"âœ… Analysis complete: {stats['url_requests']} URL requests processed")
        
        return {
            "profile_id": profile_id,
            "source_file": str(source_file),
            "output_file": str(output_file),
            "filter_ai": filter_ai,
            "include_quic": include_quic,
            "show_headers": show_headers,
            "statistics": stats,
            "filtered_requests": filtered_requests,
            "events_processed": len(events),
            "timestamp": datetime.now().isoformat()
        }
    
    def _should_exclude(self, url: str, exclude_patterns: Set[str]) -> bool:
        """Check if URL matches any exclusion pattern."""
        url_lower = url.lower()
        return any(pattern in url_lower for pattern in exclude_patterns)
    
    def _is_ai_service(self, url: str) -> bool:
        """Check if URL belongs to a known AI service."""
        url_lower = url.lower()
        return any(domain in url_lower for domain in self.AI_DOMAINS)