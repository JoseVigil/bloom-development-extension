"""Lado Emisión de Alfred hacia AITAP.

Ver AGENTS.md de installer/alfred para el estado real y los tripwires.
Resumen: el payload se arma bien (bisp_payload.py), el cliente existe
como interfaz (client.py), pero AitapClient.ask() falla a propósito
porque AITAP todavía no tiene motor de ruteo real. Nada acá está wireado
a chat.py todavía.
"""
