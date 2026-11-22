# StudyAI

StudyAI is a React, Express, and PostgreSQL learning assistant. A separate FastAPI service provides local PyTorch/Transformers extractive QA, embeddings, and OCR; local Ollama provides generative study features. No commercial AI API is required.

## Requirements

- Node.js and npm
- PostgreSQL
- Python 3.12 for the local AI service
- Tesseract OCR with Vietnamese data for scanned PDFs
- Ollama and the local generation model `qwen2.5:3b` for summaries and generated quizzes

## Configure and run

1. Create a PostgreSQL database for the application.
2. Copy `backend/.env.example` to `backend/.env`, set the database connection, and replace `JWT_SECRET` with a random value of at least 32 characters. Do not commit `.env`.
3. Start the backend:

   ```powershell
   cd backend
   npm.cmd install
   npm.cmd start
   ```

   The backend initializes the schema at startup. It listens on `http://localhost:5000`.

4. Start the frontend in another terminal:

   ```powershell
   cd frontend
   npm.cmd install
   npm.cmd run dev
   ```

5. Follow [ai_service/README.md](./ai_service/README.md) to prepare the dataset, fine-tune/load the QA checkpoint, install OCR data, and start the Python service. Set `AI_SERVICE_URL=http://127.0.0.1:8000` in `backend/.env` and restart the backend. Run Ollama locally for text-generation features; `/answer` uses the fine-tuned extractive checkpoint by default.

After dependencies, environment files, PostgreSQL, and the checkpoint are ready, `.\scripts\start-local.ps1` starts the Python service, backend, and frontend in separate processes and writes logs under `logs/`.

The backend exposes `/api/health`, `/api/health/ai`, and the `/api/auth`, `/api/subjects`, `/api/documents`, `/api/ai`, `/api/dashboard`, and `/api/notes` route groups.

## Implemented features

- Account registration, login, profile editing, and password change.
- Subject and document management, document summaries and chat history, local document RAG, multiple-choice and essay quiz attempts, and saved study-plan task progress.
- Dashboard statistics aggregated from persisted application data.
- Private notes with create, edit, delete, and optional subject association. Notes require authentication.
- PDF, DOCX, and TXT text extraction, with local Tesseract OCR for scanned PDFs.

Subject, document, note, quiz, and study-plan APIs require authentication and scope records to the signed-in account. Any legacy rows with a `NULL` owner are not exposed by these authenticated routes.

## AI and training status

The QA training pipeline uses a small original Vietnamese seed dataset (CC BY 4.0) to fine-tune the licensed `deepset/xlm-roberta-base-squad2` extractive reader. It is not a generative language model. The multilingual MiniLM embedding model is pretrained and used locally; summaries, quiz generation, and essay grading use local Ollama generation. Training and evaluation status is only established by the actual run metadata in `ai_service/checkpoints/`; no performance numbers are asserted here. RAG embeddings currently use PostgreSQL JSONB and application cosine similarity because pgvector is not available in the current Windows PostgreSQL environment.

## Validation

From `frontend`, run `npm.cmd run build`.

From `backend`, run `node --check` on the JavaScript files. The Python service API tests can be run from `ai_service` after installing its requirements:

```powershell
python -m unittest discover -s tests -v
```

Python service tests validate request handling with a stubbed local Ollama response; they do not represent a real model inference evaluation.
