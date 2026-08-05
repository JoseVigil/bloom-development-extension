"""Mirrors en Python de los contratos reales en ../../../contracts/*.ts.

No son una reinvención — son transcripciones fieles de las formas
publicadas en contracts/types.ts y contracts/errors.ts, para que el
harness (Python) hable el mismo protocolo que el resto de Bloom (TS) sin
depender de un runtime Node. Si el archivo TS real cambia, este mirror
puede quedar desactualizado — releer la fuente antes de confiar en un
campo que no esté cubierto por los tests de contrato
(tests/test_errors_contract.py).
"""
