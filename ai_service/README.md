# StudyAI local AI service

The FastAPI service runs an extractive Vietnamese question-answering reader and multilingual sentence embeddings locally with PyTorch/Transformers. Text generation (summaries, multiple-choice and essay questions, and essay grading) remains a separate local Ollama mode. No commercial AI API is called.

## Model and training data

- **Base QA model:** [`deepset/xlm-roberta-base-squad2`](https://huggingface.co/deepset/xlm-roberta-base-squad2), XLM-RoBERTa base fine-tuned upstream for extractive SQuAD 2.0 QA; model card declares CC BY 4.0.
- **Project training data:** original Vietnamese examples in `dataset/source/`, authored for StudyAI and licensed CC BY 4.0. It is a small seed set, not a representative curriculum. `dataset/README.md` documents provenance and external evaluation licensing.
- **Embedding model:** [`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2), Apache-2.0, multilingual including Vietnamese.
- **Training method:** full-parameter CPU fine-tuning, not LoRA. The trained checkpoint, tokenizer, run metadata, and measured evaluation are saved under `checkpoints/studyai-xlm-roberta-viqa/`. Do not claim a trained checkpoint exists until the training command actually completes.

The extractive model selects answer spans from provided text; it does not generate explanations, questions, or summaries. Those generative operations use the configured local Ollama model. The two inference modes are separately reported by `/health`.

## Install

Use Python 3.12 on Windows. From this directory:

```powershell
py -3.12 -m venv .venv-win
.\.venv-win\Scripts\python.exe -m pip install --upgrade pip
.\.venv-win\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.\.venv-win\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` only as needed for local executable paths and model mode. The service defaults to `AI_ANSWER_MODE=finetuned_qa`; `/answer` tries the project fine-tuned checkpoint first and uses local Ollama generation only when the extracted answer is missing or too short. Responses distinguish `finetuned_qa` from `ollama_fallback`. Set `AI_ANSWER_MODE=ollama` to explicitly use Ollama for all `/answer` requests. The `/generate` endpoint always uses local Ollama. On first model use, Transformers downloads the openly licensed model files; subsequent inference loads the configured checkpoint from disk.

## Prepare data, fine-tune, and evaluate

```powershell
.\.venv-win\Scripts\python.exe -m app.training.prepare_dataset
.\.venv-win\Scripts\python.exe -m app.training.train_qa --epochs 3 --batch-size 1 --max-length 192 --threads 4
.\.venv-win\Scripts\python.exe -m app.training.evaluate_qa
```

The preparation step validates answer spans, normalizes whitespace, removes duplicates, stratifies by topic with a fixed seed, and records the source hash and actual split counts. The training script records measured base-vs-fine-tuned held-out metrics and each epoch's loss, then saves the epoch with the lowest validation loss. XQuAD Vietnamese is only external evaluation data, never training data; it is downloaded with a SHA-256 check when requested:

```powershell
.\.venv-win\Scripts\python.exe -m app.training.evaluate_qa --include-xquad --xquad-limit 50
```

The command evaluates 50 examples for a practical CPU check. Omit `--xquad-limit` to evaluate the complete published validation split. Do not copy metrics from documentation: use the actual saved `training_metadata.json` and `evaluation.json`.

## OCR for scanned PDFs

Install the local Tesseract OCR engine. From this directory, download the official `tessdata_fast` English and Vietnamese models (Apache-2.0); the downloader checks their Git blob hashes before saving:

```powershell
.\.venv-win\Scripts\python.exe -m app.training.download_ocr_data
```

Set `TESSERACT_CMD` to the local `tesseract.exe` path in `.env` if it is not on `PATH`. `TESSDATA_PREFIX` defaults to `ai_service/models/tessdata`. The OCR API accepts PDF bytes, processes at most 20 pages/20 MB (and 20 megapixels per scanned page), and returns an explicit error if Tesseract or Vietnamese data is missing.

## Run and connect the backend

Start local Ollama for text-generation features, then run the service:

```powershell
ollama pull qwen2.5:3b
.\.venv-win\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Configure `AI_SERVICE_URL=http://127.0.0.1:8000` in `backend/.env`, then restart the Node.js backend. Available endpoints:

- `GET /health` — checkpoint, model mode, and local Ollama readiness.
- `POST /answer` — extractive QA using the fine-tuned checkpoint by default.
- `POST /embed` — local multilingual Transformers embeddings (384 dimensions).
- `POST /generate` — local Ollama generation; errors if Ollama is unavailable.
- `POST /ocr` — local PDF text extraction/OCR.

Run Python tests with `.\.venv-win\Scripts\python.exe -m unittest discover -s tests -v`. The tests mock model outputs; they validate API contracts, not actual inference accuracy. Real inference and training results must be verified separately using the scripts above.

## Current storage limitation

The Node.js RAG implementation stores embeddings as PostgreSQL JSONB and computes cosine similarity in the application. pgvector is not available in the current Windows PostgreSQL installation, so this project does **not** claim PostgreSQL vector-index support. The JSONB path still scopes document chunks to the authorized document.
