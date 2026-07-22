import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Optional

ENGINE_DIR = Path(__file__).resolve().parent
LICENSE_MARKER = ENGINE_DIR / ".tos_accepted"
LICENSE_ACCEPTED = LICENSE_MARKER.exists()
if LICENSE_ACCEPTED:
    os.environ.setdefault("COQUI_TOS_AGREED", "1")

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from TTS.api import TTS

HOST = "127.0.0.1"
PORT = 3211
ROOT = Path(os.environ.get("APPDATA", str(Path.home()))) / "Sanny Desktop"
SAMPLES = ROOT / "voice-lab" / "samples"
PROFILES = ROOT / "voice-lab" / "profiles"
SAMPLES.mkdir(parents=True, exist_ok=True)
PROFILES.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Sanny Voice Engine", version="0.4.1")
model: Optional[TTS] = None
model_lock = threading.Lock()
device = "cuda" if torch.cuda.is_available() else "cpu"


class SynthesisRequest(BaseModel):
    text: str
    language: str = "cs"
    profile: str = "sanny"


class ProfileRequest(BaseModel):
    name: str = "sanny"
    samples: list[str] = Field(default_factory=list)


def get_model() -> TTS:
    global model
    if not LICENSE_ACCEPTED:
        raise HTTPException(
            428,
            "Nejdřív spusť voice-engine\\install-engine.bat a potvrď licenci XTTS-v2.",
        )
    with model_lock:
        if model is None:
            model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    return model


def safe_profile_name(name: str) -> str:
    return "".join(c for c in name if c.isalnum() or c in "_-. ").strip() or "sanny"


def profile_file(name: str) -> Path:
    return PROFILES / safe_profile_name(name) / "profile.json"


def profile_samples(name: str) -> list[str]:
    p = profile_file(name)
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            files = [str(Path(x)) for x in data.get("samples", []) if Path(x).exists()]
            if files:
                return files
        except (OSError, json.JSONDecodeError):
            pass
    return [str(x) for x in sorted(SAMPLES.glob("*.wav"))[:10]]


@app.get("/health")
def health():
    if not LICENSE_ACCEPTED:
        raise HTTPException(428, "Licence XTTS-v2 zatím nebyla potvrzena.")
    return {
        "ok": True,
        "license_accepted": True,
        "model_loaded": model is not None,
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "sample_count": len(list(SAMPLES.glob("*.wav"))),
    }


@app.get("/profiles")
def profiles():
    result = []
    for p in PROFILES.glob("*/profile.json"):
        try:
            result.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return {"profiles": result}


@app.post("/profiles/create")
def create_profile(req: ProfileRequest):
    chosen = []
    for item in req.samples:
        candidate = SAMPLES / Path(item).name
        if candidate.exists() and candidate.suffix.lower() == ".wav":
            chosen.append(str(candidate.resolve()))
    if not chosen:
        chosen = [str(x.resolve()) for x in sorted(SAMPLES.glob("*.wav"))[:10]]
    if not chosen:
        raise HTTPException(400, "Nejsou dostupné žádné WAV vzorky.")

    name = safe_profile_name(req.name)
    p = profile_file(name)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = {"name": name, "language": "cs", "samples": chosen}
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


@app.post("/synthesize")
def synthesize(req: SynthesisRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Text je prázdný.")

    refs = profile_samples(req.profile)
    if not refs:
        raise HTTPException(400, "Hlasový profil nemá žádné WAV reference.")

    tts = get_model()
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_path = tmp.name
        tts.tts_to_file(
            text=text[:5000],
            speaker_wav=refs,
            language=req.language,
            file_path=temp_path,
        )
        audio = Path(temp_path).read_bytes()
        return Response(content=audio, media_type="audio/wav")
    finally:
        if temp_path:
            try:
                Path(temp_path).unlink(missing_ok=True)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
