"""Mint the three synthetic Alfred identity candidates for the Phase 0c gate."""

from pathlib import Path
from time import perf_counter

import soundfile as sf
import torch
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer


MODEL_ID = "parler-tts/parler-tts-mini-v1.1"
PROMPT = (
    "Good evening. I have reviewed the work before us. Everything remains under control, "
    "and I will stay close while you decide the next step. There is no need to hurry. "
    "We will proceed carefully, clearly, and with purpose."
)
VARIANTS = (
    (
        104729,
        "A distinguished British male voice, around 60 years old, with a deep and gentle "
        "register. He speaks at a calm, measured pace with a warm, intimate tone and "
        "understated authority. The studio recording is very clear, close, and dry.",
    ),
    (
        208879,
        "A mature British gentleman in his early sixties speaks in a low, resonant voice. "
        "His delivery is soft, unhurried, reassuring, and precise, with restrained emotion "
        "and quiet confidence. The audio is very clear, intimate, and studio quality.",
    ),
    (
        317773,
        "An older British male speaker has a dark, velvety baritone and discreet authority. "
        "He speaks slowly and thoughtfully, with gentle warmth, subtle pauses, and the calm "
        "presence of a trusted private adviser. The close-mic recording is very clear.",
    ),
)


def main() -> None:
    output_dir = Path(__file__).resolve().parent.parent / "voice_samples" / "synthetic_identity"
    output_dir.mkdir(parents=True, exist_ok=True)

    load_started = perf_counter()
    model = ParlerTTSForConditionalGeneration.from_pretrained(MODEL_ID).to("cpu").eval()
    prompt_tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    description_tokenizer = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
    print(f"model_load={perf_counter() - load_started:.3f}s")

    prompt_ids = prompt_tokenizer(PROMPT, return_tensors="pt").input_ids
    for index, (seed, description) in enumerate(VARIANTS, start=1):
        torch.manual_seed(seed)
        description_ids = description_tokenizer(description, return_tensors="pt").input_ids
        started = perf_counter()
        with torch.inference_mode():
            generation = model.generate(
                input_ids=description_ids,
                prompt_input_ids=prompt_ids,
                do_sample=True,
            )
        audio = generation.cpu().numpy().squeeze()
        path = output_dir / f"parler_variant_{index}.wav"
        sf.write(path, audio, model.config.sampling_rate, subtype="PCM_16")
        duration = len(audio) / model.config.sampling_rate
        print(f"{path.name}: seed={seed} generation={perf_counter() - started:.3f}s audio={duration:.3f}s")


if __name__ == "__main__":
    main()
