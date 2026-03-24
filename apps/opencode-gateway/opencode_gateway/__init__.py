"""
opencode-gateway: ACP protocol gateway bridging opencode clients to secbot agents.
"""

__version__ = "0.1.0"

from opencode_gateway.agent import ACPAgent
from opencode_gateway.protocol import NDJsonTransport
from opencode_gateway.event_mapper import EventMapper
from opencode_gateway.session import ACPSessionStore

__all__ = ["ACPAgent", "NDJsonTransport", "EventMapper", "ACPSessionStore"]
