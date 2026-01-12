"""
Web layer for profile management.
Page generators and template processors.
"""

from brain.core.profile.web.discovery_generator import generate_discovery_page
from brain.core.profile.web.landing_generator import generate_profile_landing

__all__ = [
    'generate_discovery_page',
    'generate_profile_landing'
]