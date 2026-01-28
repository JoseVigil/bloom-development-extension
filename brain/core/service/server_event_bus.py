"""
Event Bus Core - The Historian
Manages event queue, persistence to events.jsonl, and event filtering.
Independent of network layer - only handles event lifecycle.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from collections import deque

try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except ImportError:
    AIOFILES_AVAILABLE = False

logger = logging.getLogger("brain.event_bus")


class EventBus:
    """
    The Historian - Manages event lifecycle without network concerns.
    
    Responsibilities:
    - Maintain in-memory event queue (deque with max capacity)
    - Persist critical events to events.jsonl
    - Hydrate queue from disk on startup
    - Provide event filtering for POLL_EVENTS
    """
    
    def __init__(self, events_file: Path, max_memory: int = 1000):
        """
        Initialize EventBus with specified capacity.
        
        Args:
            events_file: Path to events.jsonl persistence file
            max_memory: Maximum events to keep in memory
        """
        self.events_file = events_file
        self.event_queue = deque(maxlen=max_memory)
        self.max_memory = max_memory
        
        # Critical events requiring immediate disk persistence
        self.CRITICAL_EVENTS = {
            'ONBOARDING_COMPLETE',
            'INTENT_COMPLETE',
            'INTENT_FAILED',
            'EXTENSION_ERROR',
            'PROFILE_STATUS_CHANGE',
            'BRAIN_SERVICE_STATUS',
            'PROFILE_CONNECTED',
            'PROFILE_DISCONNECTED'
        }
        
        logger.info(f"📚 EventBus initialized (max_memory={max_memory})")
    
    async def hydrate_from_disk(self):
        """
        Rehydrate in-memory queue from events.jsonl on startup.
        Loads the most recent N events up to max_memory capacity.
        """
        if not self.events_file.exists():
            logger.info("📖 No previous event history found")
            return
        
        try:
            logger.info(f"📖 Rehydrating events from {self.events_file}")
            
            if AIOFILES_AVAILABLE:
                async with aiofiles.open(self.events_file, 'r', encoding='utf-8') as f:
                    lines = await f.readlines()
            else:
                import asyncio
                loop = asyncio.get_event_loop()
                lines = await loop.run_in_executor(
                    None,
                    self._sync_read_lines
                )
            
            # Load most recent N lines
            recent_lines = lines[-self.max_memory:] if len(lines) > self.max_memory else lines
            
            loaded_count = 0
            for line in recent_lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    self.event_queue.append(event)
                    loaded_count += 1
                except json.JSONDecodeError as e:
                    logger.warning(f"⚠️ Corrupted line in events.jsonl: {e}")
            
            logger.info(f"✅ {loaded_count} events rehydrated into memory")
            
        except Exception as e:
            logger.error(f"❌ Error rehydrating events: {e}", exc_info=True)
            self.event_queue.clear()
    
    def _sync_read_lines(self) -> List[str]:
        """Synchronous fallback for reading lines"""
        with open(self.events_file, 'r', encoding='utf-8') as f:
            return f.readlines()
    
    async def persist_event(self, event: Dict[str, Any]):
        """
        Write critical event to disk asynchronously.
        Uses aiofiles if available, otherwise executor fallback.
        
        Args:
            event: Event dictionary to persist
        """
        try:
            event_line = json.dumps(event, ensure_ascii=False) + '\n'
            
            if AIOFILES_AVAILABLE:
                async with aiofiles.open(self.events_file, 'a', encoding='utf-8') as f:
                    await f.write(event_line)
            else:
                import asyncio
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    self._sync_write,
                    event_line
                )
            
            logger.debug(f"💾 Event persisted: {event.get('type', 'UNKNOWN')}")
            
        except Exception as e:
            logger.error(f"❌ Error persisting event: {e}", exc_info=True)
    
    def _sync_write(self, event_line: str):
        """Synchronous fallback for writing events"""
        with open(self.events_file, 'a', encoding='utf-8') as f:
            f.write(event_line)
    
    async def add_event(self, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add event to queue and persist if critical.
        Returns the created event for broadcasting by caller.
        
        Args:
            event_type: Type identifier for the event
            data: Event payload
            
        Returns:
            Complete event dictionary with timestamp
        """
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        event = {
            'type': event_type,
            'timestamp': timestamp,
            'data': data
        }
        
        # Add to in-memory queue
        self.event_queue.append(event)
        
        # Persist if critical
        if event_type in self.CRITICAL_EVENTS:
            await self.persist_event(event)
        
        logger.info(f"📝 Event added: {event_type}")
        return event
    
    def poll_events(self, since_timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Retrieve events since specified timestamp.
        
        Args:
            since_timestamp: ISO timestamp to filter from (None = all events)
            
        Returns:
            List of events after the specified timestamp
        """
        if not since_timestamp:
            return list(self.event_queue)
        
        filtered = []
        for event in self.event_queue:
            event_time = event.get('timestamp', '')
            if event_time > since_timestamp:
                filtered.append(event)
        
        logger.info(f"📊 POLL_EVENTS: {len(filtered)} events since {since_timestamp}")
        return filtered
    
    def get_all_events(self) -> List[Dict[str, Any]]:
        """
        Retrieve all events currently in memory.
        
        Returns:
            List of all events in queue
        """
        return list(self.event_queue)
    
    def clear(self):
        """Clear all events from memory (does not affect disk persistence)"""
        self.event_queue.clear()
        logger.info("🧹 Event queue cleared")