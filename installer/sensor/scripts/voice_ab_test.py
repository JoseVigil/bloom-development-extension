"""Generate the Phase 0 Spanish voice samples for bloom-sensor."""

from pathlib import Path
from time import perf_counter

import numpy as np
import soundfile as sf
from kokoro import KPipeline


SAMPLE_RATE = 24_000
VOICES = ("ef_dora", "em_alex")
PHRASES = {
    "short": "Sensor está listo para acompañarte.",
    "numbers": "El análisis procesó 128 archivos en 3 minutos y 42 segundos.",
    "question": "¿Querés que lea el resultado completo o solamente el resumen?",
    "technical": "El flujo incluye commit, merge, pull request, revisión y despliegue.",
    "paragraph": (
        "Terminamos la ejecución del mandato. Los cambios fueron verificados, las pruebas "
        "finalizaron correctamente y el sistema conserva el contexto necesario para que "
        "puedas continuar trabajando sin perder concentración."
    ),
}


def main() -> None:
    output_dir = Path(__file__).resolve().parent.parent / "voice_samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="e", device="cpu")

    for voice in VOICES:
        for label, text in PHRASES.items():
            started = perf_counter()
            chunks = [result.audio.numpy() for result in pipeline(text, voice=voice, speed=1.0)]
            elapsed = perf_counter() - started
            audio = np.concatenate(chunks)
            duration = len(audio) / SAMPLE_RATE
            rtf = elapsed / duration
            output_path = output_dir / f"{voice}_{label}.wav"
            sf.write(output_path, audio, SAMPLE_RATE, subtype="PCM_16")
            print(f"{output_path.name}: generation={elapsed:.3f}s audio={duration:.3f}s RTF={rtf:.3f}")


if __name__ == "__main__":
    main()
