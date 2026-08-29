"""Generate the eight Kokoro voice samples for the Phase 0b identity gate."""

from pathlib import Path
from time import perf_counter

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline


SAMPLE_RATE = 24_000
PHRASES = {
    "short": "Sensor está listo para acompañarte.",
    "paragraph": (
        "Terminamos la ejecución del mandato. Los cambios fueron verificados, las pruebas "
        "finalizaron correctamente y el sistema conserva el contexto necesario para que "
        "puedas continuar trabajando sin perder concentración."
    ),
}
RECIPES = {
    "em_santa": {"em_santa": 1.0},
    "blend_dora65_santa35": {"ef_dora": 0.65, "em_santa": 0.35},
    "blend_alex55_santa45": {"em_alex": 0.55, "em_santa": 0.45},
    "blend_dora40_alex35_santa25": {"ef_dora": 0.40, "em_alex": 0.35, "em_santa": 0.25},
}


def blend(pipeline: KPipeline, recipe: dict[str, float]) -> torch.FloatTensor:
    packs = [(pipeline.load_single_voice(name), weight) for name, weight in recipe.items()]
    return sum((pack * weight for pack, weight in packs), torch.zeros_like(packs[0][0]))


def main() -> None:
    output_dir = Path(__file__).resolve().parent.parent / "voice_samples"
    output_dir.mkdir(parents=True, exist_ok=True)

    load_started = perf_counter()
    pipeline = KPipeline(lang_code="e", device="cpu")
    voices = {name: blend(pipeline, recipe) for name, recipe in RECIPES.items()}
    print(f"model_and_voices_load={perf_counter() - load_started:.3f}s")

    for name, voice_tensor in voices.items():
        for label, text in PHRASES.items():
            started = perf_counter()
            chunks = [result.audio.numpy() for result in pipeline(text, voice=voice_tensor, speed=1.0)]
            elapsed = perf_counter() - started
            audio = np.concatenate(chunks)
            duration = len(audio) / SAMPLE_RATE
            output_path = output_dir / f"{name}_{label}.wav"
            sf.write(output_path, audio, SAMPLE_RATE, subtype="PCM_16")
            print(
                f"{output_path.name}: generation={elapsed:.3f}s "
                f"audio={duration:.3f}s RTF={elapsed / duration:.3f}"
            )


if __name__ == "__main__":
    main()
