import json
import math
import os
import re
import threading
from pathlib import Path

import httpx
import numpy as np
import pytesseract
import pymupdf as fitz
import torch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from PIL import Image
from pydantic import BaseModel, Field, validator
from starlette.concurrency import run_in_threadpool
from transformers import AutoModel, AutoModelForQuestionAnswering, AutoTokenizer

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
AI_ANSWER_MODE = os.getenv("AI_ANSWER_MODE", "finetuned_qa").strip().lower()
if AI_ANSWER_MODE not in {"finetuned_qa", "ollama"}:
    raise ValueError("AI_ANSWER_MODE must be 'finetuned_qa' or 'ollama'.")

SERVICE_ROOT = Path(__file__).resolve().parents[1]
QA_CHECKPOINT_DIR = Path(os.getenv("QA_CHECKPOINT_DIR", "checkpoints/studyai-xlm-roberta-viqa"))
if not QA_CHECKPOINT_DIR.is_absolute():
    QA_CHECKPOINT_DIR = SERVICE_ROOT / QA_CHECKPOINT_DIR
QA_BASE_MODEL = os.getenv("QA_BASE_MODEL", "deepset/xlm-roberta-base-squad2")
AI_EMBEDDING_MODEL = os.getenv(
    "AI_EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
AI_CPU_THREADS = max(1, int(os.getenv("AI_CPU_THREADS", "4")))
MAX_OCR_PDF_BYTES = int(os.getenv("MAX_OCR_PDF_BYTES", "20000000"))
MAX_OCR_PAGES = 20
OCR_LANGUAGE = os.getenv("OCR_LANGUAGE", "vie+eng")
TESSDATA_PREFIX = Path(os.getenv("TESSDATA_PREFIX", "models/tessdata"))
if not TESSDATA_PREFIX.is_absolute():
    TESSDATA_PREFIX = SERVICE_ROOT / TESSDATA_PREFIX
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")

torch.set_num_threads(AI_CPU_THREADS)
if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

app = FastAPI(
    title="StudyAI Local AI Service",
    description="Local fine-tuned QA, Transformers embeddings, local Ollama generation, and OCR.",
    version="2.1.0",
)

_qa_runtime = None
_qa_load_lock = threading.Lock()
_embedding_runtime = None
_embedding_load_lock = threading.Lock()
_inference_lock = threading.Lock()


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=100_000)
    model: str | None = Field(default=None, min_length=1, max_length=150)
    options: dict[str, int | float | str | bool] = Field(default_factory=dict)

    @validator("prompt")
    def prompt_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Prompt must contain non-whitespace text.")
        return value


class EmbedRequest(BaseModel):
    input: str | list[str]
    model: str | None = Field(default=None, min_length=1, max_length=150)

    @validator("input")
    def validate_input(cls, value: str | list[str]) -> str | list[str]:
        texts = [value] if isinstance(value, str) else value
        if not texts or len(texts) > 32 or any(not text.strip() for text in texts):
            raise ValueError("Embedding input must contain between 1 and 32 non-empty texts.")
        return value


class AnswerRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    context: str = Field(..., max_length=50000)
    max_answer_tokens: int = Field(default=32, ge=1, le=64)

    @validator("question")
    def question_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Question must contain non-whitespace text.")
        return value.strip()


async def _ollama_json(path: str, payload: dict | None = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
            response = (
                await client.post(f"{OLLAMA_URL}{path}", json=payload)
                if payload is not None
                else await client.get(f"{OLLAMA_URL}{path}")
            )
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Local Ollama request timed out.") from error
    except httpx.RequestError as error:
        raise HTTPException(status_code=503, detail="Cannot connect to the configured local Ollama service.") from error

    if response.is_error:
        detail = "Local Ollama returned HTTP response."
        try:
            detail = response.json().get("error") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=detail)
    try:
        result = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Local Ollama returned invalid JSON.") from error
    if not isinstance(result, dict) or result.get("error"):
        raise HTTPException(status_code=502, detail="Local Ollama returned an invalid response.")
    return result


def _checkpoint_is_available() -> bool:
    return (
        (QA_CHECKPOINT_DIR / "config.json").is_file()
        and any((QA_CHECKPOINT_DIR / filename).is_file() for filename in ("model.safetensors", "pytorch_model.bin"))
    )


def _get_qa_runtime():
    global _qa_runtime
    if _qa_runtime is None:
        with _qa_load_lock:
            if _qa_runtime is None:
                if not _checkpoint_is_available():
                    raise HTTPException(status_code=503, detail="Fine-tuned QA checkpoint is not installed.")
                try:
                    tokenizer = AutoTokenizer.from_pretrained(
                        QA_CHECKPOINT_DIR,
                        use_fast=True,
                        local_files_only=True,
                    )
                    model = AutoModelForQuestionAnswering.from_pretrained(
                        QA_CHECKPOINT_DIR,
                        local_files_only=True,
                    )
                    model.to("cpu")
                    model.eval()
                    _qa_runtime = (tokenizer, model)
                except (OSError, ValueError, RuntimeError) as error:
                    raise HTTPException(status_code=503, detail=f"Could not load local QA checkpoint: {error}") from error
    return _qa_runtime


def _get_embedding_runtime():
    global _embedding_runtime
    if _embedding_runtime is None:
        with _embedding_load_lock:
            if _embedding_runtime is None:
                try:
                    tokenizer = AutoTokenizer.from_pretrained(AI_EMBEDDING_MODEL, use_fast=True)
                    model = AutoModel.from_pretrained(AI_EMBEDDING_MODEL)
                    model.to("cpu")
                    model.eval()
                    _embedding_runtime = (tokenizer, model)
                except (OSError, ValueError, RuntimeError) as error:
                    raise HTTPException(status_code=503, detail=f"Could not load local embedding model: {error}") from error
    return _embedding_runtime


def _encode_texts(texts: list[str]) -> list[list[float]]:
    tokenizer, model = _get_embedding_runtime()
    embeddings = []
    for offset in range(0, len(texts), 8):
        batch = texts[offset:offset + 8]
        encoded = tokenizer(batch, padding=True, truncation=True, max_length=256, return_tensors="pt")
        with _inference_lock, torch.inference_mode():
            token_vectors = model(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).expand(token_vectors.size()).float()
            pooled = (token_vectors * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
        embeddings.extend(pooled.cpu().tolist())
    return embeddings


def _answer_with_checkpoint(question: str, context: str, max_answer_tokens: int = 32) -> dict:
    from app.training.qa_model import predict_one

    tokenizer, model = _get_qa_runtime()
    with _inference_lock:
        prediction = predict_one(tokenizer, model, question, context)
    answer_text = prediction["answer"]
    if answer_text:
        answer_text = f"**Trả lời:** {answer_text}"
    else:
        answer_text = "Tôi không tìm thấy nội dung liên quan trong ngữ cảnh được cung cấp."
    citations = sorted({int(index) for index in re.findall(r"\[Đoạn\s+(\d+)\]", context, flags=re.IGNORECASE)})
    return {
        "answer": answer_text,
        "score": prediction["score"],
        "model_mode": "finetuned_qa",
        "model": f"fine-tuned:{QA_BASE_MODEL}",
        "citations": citations,
    }


def _ocr_pdf_sync(pdf_bytes: bytes) -> dict:
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=415, detail="OCR input is not a valid PDF.")
    if len(pdf_bytes) > MAX_OCR_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"OCR PDF exceeds the {MAX_OCR_PDF_BYTES}-byte limit.")
    languages = set(OCR_LANGUAGE.split("+"))
    if "vie" in languages and not (TESSDATA_PREFIX / "vie.traineddata").is_file():
        raise HTTPException(status_code=503, detail="Vietnamese Tesseract data is not installed.")
    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
        if document.page_count > MAX_OCR_PAGES:
            document.close()
            raise HTTPException(status_code=413, detail=f"OCR PDF exceeds {MAX_OCR_PAGES} pages.")
        pages = []
        for page_number, page in enumerate(document, start=1):
            page_text = page.get_text("text").strip()
            if len(page_text) < 30:
                try:
                    pytesseract.get_tesseract_version()
                    if page.rect.width * page.rect.height * 4 > 20_000_000:
                        raise HTTPException(status_code=413, detail=f"Scanned page {page_number} exceeds the OCR pixel limit.")
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
                    page_text = pytesseract.image_to_string(
                        image,
                        lang=OCR_LANGUAGE,
                        config=f"--tessdata-dir {TESSDATA_PREFIX} --psm 6",
                        timeout=30,
                    ).strip()
                except pytesseract.TesseractNotFoundError as error:
                    raise HTTPException(status_code=503, detail="Tesseract OCR engine is not installed.") from error
                except pytesseract.TesseractError as error:
                    raise HTTPException(status_code=503, detail=f"Tesseract OCR failed: {error}") from error
                except RuntimeError as error:
                    raise HTTPException(status_code=504, detail="Tesseract OCR timed out on a PDF page.") from error
            if page_text:
                pages.append(f"[Trang {page_number}]\n{page_text}")
        page_count = document.page_count
        document.close()
        extracted = "\n\n".join(pages).strip()
        if not extracted:
            raise HTTPException(status_code=422, detail="No readable text was found in the PDF, including after OCR.")
        return {"text": extracted, "pages": len(pages), "page_count": page_count, "engine": "tesseract-local"}
    except HTTPException:
        raise
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=f"Could not read the PDF: {error}") from error


@app.get("/health")
async def health(response: Response) -> dict:
    ollama_running = False
    models = []
    try:
        result = await _ollama_json("/api/tags")
        ollama_running = True
        models = [model.get("name", "") for model in result.get("models", []) if isinstance(model, dict)]
    except HTTPException:
        pass

    checkpoint_available = _checkpoint_is_available()
    generation_available = any(model.split(":")[0] == OLLAMA_MODEL.split(":")[0] for model in models)
    ready = checkpoint_available if AI_ANSWER_MODE == "finetuned_qa" else (ollama_running and generation_available)
    if not ready:
        response.status_code = 503
    return {
        "status": "ready" if ready else "models_missing",
        "ollama_running": ollama_running,
        "ollama_model_available": generation_available,
        "generation_model": OLLAMA_MODEL,
        "generation_model_available": generation_available,
        "answer_mode": AI_ANSWER_MODE,
        "qa_checkpoint": str(QA_CHECKPOINT_DIR),
        "qa_checkpoint_available": checkpoint_available,
        "qa_model_loaded": _qa_runtime is not None,
        "embedding_model": AI_EMBEDDING_MODEL,
        "embedding_mode": "local_transformers",
        "embedding_model_loaded": _embedding_runtime is not None,
        "available_models": models,
    }


@app.post("/generate")
async def generate(request: GenerateRequest) -> dict[str, str]:
    result = await _ollama_json(
        "/api/generate",
        {
            "model": request.model or OLLAMA_MODEL,
            "prompt": request.prompt,
            "stream": False,
            "options": request.options,
        },
    )
    generated = result.get("response")
    if not isinstance(generated, str) or not generated.strip():
        raise HTTPException(status_code=502, detail="Local Ollama returned an empty generation.")
    return {"response": generated.strip()}


@app.post("/embed")
async def embed(request: EmbedRequest) -> dict:
    if request.model and request.model != AI_EMBEDDING_MODEL:
        raise HTTPException(status_code=400, detail=f"Only the configured local model is supported: {AI_EMBEDDING_MODEL}.")
    texts = [request.input] if isinstance(request.input, str) else request.input
    vectors = await run_in_threadpool(_encode_texts, texts)
    if any(not vector or any(not math.isfinite(value) for value in vector) for vector in vectors):
        raise HTTPException(status_code=502, detail="Local embedding model returned invalid vectors.")
    return {"embeddings": vectors, "model": AI_EMBEDDING_MODEL}


@app.post("/answer")
async def answer(request: AnswerRequest) -> dict:
    if AI_ANSWER_MODE == "ollama":
        prompt = (
            "Trả lời bằng tiếng Việt, chỉ dựa trên ngữ cảnh. Nếu không đủ căn cứ, hãy nói rõ. "
            "Giữ nguyên mã nguồn [Đoạn n].\n\n"
            f"NGỮ CẢNH:\n{request.context}\n\nCÂU HỎI: {request.question}\nTRẢ LỜI:"
        )
        result = await _ollama_json(
            "/api/generate",
            {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "options": {"num_predict": min(192, request.max_answer_tokens * 4)}},
        )
        generated = result.get("response")
        if not isinstance(generated, str) or not generated.strip():
            raise HTTPException(status_code=502, detail="Local Ollama returned an empty answer.")
        return {
            "answer": generated.strip(),
            "score": None,
            "model_mode": "ollama",
            "model": OLLAMA_MODEL,
            "citations": sorted({int(index) for index in re.findall(r"\[Đoạn\s+(\d+)\]", request.context)}),
        }
    checkpoint_result = await run_in_threadpool(
        _answer_with_checkpoint,
        request.question,
        request.context,
        request.max_answer_tokens,
    )
    extracted_word_count = len(re.findall(r"\w+", checkpoint_result["answer"], flags=re.UNICODE))
    if (checkpoint_result["score"] == 0 or extracted_word_count < 5) and request.context.strip():
        prompt = (
            "Trả lời bằng tiếng Việt chỉ dựa trên ngữ cảnh được cung cấp. "
            "Nếu ngữ cảnh không chứa căn cứ, hãy nói rõ là không tìm thấy. "
            "Không thêm thông tin ngoài tài liệu và giữ nguyên ký hiệu trích dẫn [Đoạn n].\n\n"
            f"NGỮ CẢNH:\n{request.context}\n\nCÂU HỎI: {request.question}\nTRẢ LỜI:"
        )
        result = await _ollama_json(
            "/api/generate",
            {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": min(192, request.max_answer_tokens * 4)},
            },
        )
        generated = result.get("response")
        if not isinstance(generated, str) or not generated.strip():
            raise HTTPException(status_code=502, detail="Local Ollama fallback returned an empty answer.")
        return {
            "answer": generated.strip(),
            "score": checkpoint_result["score"],
            "model_mode": "ollama_fallback",
            "model": OLLAMA_MODEL,
            "citations": checkpoint_result["citations"],
        }
    return checkpoint_result


@app.post("/ocr")
async def ocr(request: Request) -> dict:
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_OCR_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"OCR PDF exceeds the {MAX_OCR_PDF_BYTES}-byte limit.")
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_OCR_PDF_BYTES:
            raise HTTPException(status_code=413, detail=f"OCR PDF exceeds the {MAX_OCR_PDF_BYTES}-byte limit.")
    return await run_in_threadpool(_ocr_pdf_sync, bytes(content))