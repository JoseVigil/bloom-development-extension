"""
Synapse Exceptions
"""


class SynapseError(Exception):
    """Base exception para errores de Synapse"""
    pass


class ConnectionError(SynapseError):
    """Error de conexión con la Extension"""
    pass


class CommandError(SynapseError):
    """Error ejecutando un comando"""
    pass


class TimeoutError(SynapseError):
    """Timeout esperando respuesta"""
    pass
