"""Pieza 1 — abstracción de proveedor.

Dos arms con roles asimétricos (ver ../../context/DECISION-ollama-role.md):

- OllamaEmbeddingProvider — SOLO genera embeddings (nomic-embed-text, local).
- GeminiTextProvider — el único que genera texto/razonamiento real.

No hay una interfaz simétrica "AIProviderArm" con un método por operación
donde un arm implementa la mitad como NotImplementedError: cada arm expone
solo la interfaz que su rol real soporta (EmbeddingProviderArm /
TextGenerationProviderArm en base.py), porque mentir sobre capacidad
simétrica es exactamente el error que este diseño evita.
"""
