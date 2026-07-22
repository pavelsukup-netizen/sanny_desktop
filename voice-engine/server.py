import io
import json
import os
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from TTS.api import TTS

HOST = "127.0.0.1"
PORT = 3211
ROOT = Path(os.environ.get("APPDATA", str(Path.home()))) / "Sanny Desktop"
SAMPLES = ROOT / "voice-lab" / "samples"
PROFILES = ROOT / "voice-lab" / "profiles"
SAMPLES.mkdir(parents=True, exist_ok=True)
PROFILES.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Sanny Voice Engine", version="0.4.0")
model: Optional[TTS] = None
device = "cuda" if torch.cuda.is_available() else "cpu"

class SynthesisRequest(BaseModel):
    text: str
    language: str = "cs"
    profile: str = "sanny"

class ProfileRequest(BaseModel):
    name: str = "sanny"
    samples: list[str] = []


def get_model() -> TTS:
    global model
    if model is None:
        model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    return model


def profile_file(name: str) -> Path:
    safe = "".join(c for c in name if c.isalnum() or c in "_-.") or "sanny"
    return PROFILES / safe / "profile.json"


def profile_samples(name: str) -> list[str]:
    p = profile_file(name)
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        files = [str(Path(x)) for x in data.get("samples", []) if Path(x).exists()]
        if files:
            return files
    return [str(x) for x in sorted(SAMPLES.glob("*.wav"))[:10]]

@app.get("/health")
def health():
    return {
        "ok": True,
        "model_loaded": model is not None,
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "sample_count": len(list(SAMPLES.glob("*.wav")))
    }

@app.get("/profiles")
def profiles():
    result = []
    for p in PROFILES.glob("*/profile.json"):
        data = json.loads(p.read_text(encoding="utf-8"))
        result.append(data)
    return {"profiles": result}

@app.post("/profiles/create")
def create_profile(req: ProfileRequest):
    chosen = []
    for item in req.samples:
        candidate = SAMPLES / Path(item).name
        if candidate.exists() and candidate.suffix.lower() == ".wav":
            chosen.append(str(candidate))
    if not chosen:
        chosen = [str(x) for x in sorted(SAMPLES.glob("*.wav"))[:10]]
    if not chosen:
        raise HTTPException(400, "Nejsou dostupné žádné WAV vzorky.")
    p = profile_file(req.name)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = {"name": req.name, "language": "cs", "samples": chosen}
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
    buffer = io.BytesIO()
    tts.tts_to_file(text=text[:5000], speaker_wav=refs, language=req.language, file_path=buffer)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
