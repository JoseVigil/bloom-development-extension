"""
Chrome core functionality.
Pure business logic for Chrome profile and log analysis.
"""

from brain.core.chrome.log_reader import ChromeLogReader
from brain.core.chrome.net_log_analyzer import NetLogAnalyzer

__all__ = ['ChromeLogReader', 'NetLogAnalyzer']