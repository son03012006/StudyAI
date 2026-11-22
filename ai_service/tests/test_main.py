import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main


class FakeResponse:
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code
        self.is_error = status_code >= 400

    def json(self) -> dict:
        return self._data


class FakeAsyncClient:
    response = FakeResponse({})
    calls: list[tuple[str, dict | None]] = []

    def __init__(self, **_kwargs):
        self.calls = []
        type(self).calls = self.calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url: str, json: dict):
        self.calls.append((url, json))
        return type(self).response

    async def get(self, url: str):
        self.calls.append((url, None))
        return type(self).response


class AiServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        FakeAsyncClient.calls = []

    def test_generate_forwards_prompt_to_local_ollama(self):
        FakeAsyncClient.response = FakeResponse({"response": "Local answer"})
        with patch.object(main.httpx, "AsyncClient", FakeAsyncClient):
            response = self.client.post(
                "/generate",
                json={"prompt": "Explain a concept", "options": {"temperature": 0.4}},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"response": "Local answer"})
        self.assertEqual(FakeAsyncClient.calls[0][1]["prompt"], "Explain a concept")
        self.assertEqual(FakeAsyncClient.calls[0][1]["model"], main.OLLAMA_MODEL)

    def test_answer_uses_the_local_fine_tuned_reader(self):
        answer = {
            "answer": "**Trả lời:** khóa chính [Đoạn 1]",
            "score": 0.9,
            "model_mode": "finetuned_qa",
            "model": "fine-tuned:test",
            "citations": [1],
        }
        with patch.object(main, "_answer_with_checkpoint", return_value=answer) as answer_model:
            response = self.client.post(
                "/answer",
                json={"question": "Khóa chính là gì?", "context": "[Đoạn 1] ..."},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), answer)
        answer_model.assert_called_once_with("Khóa chính là gì?", "[Đoạn 1] ...", 32)

    def test_answer_uses_local_ollama_when_checkpoint_cannot_extract_a_span(self):
        no_answer = {
            "answer": "Tôi không tìm thấy nội dung liên quan trong ngữ cảnh được cung cấp.",
            "score": 0.0,
            "model_mode": "finetuned_qa",
            "model": "fine-tuned:test",
            "citations": [1],
        }
        FakeAsyncClient.response = FakeResponse({"response": "Khóa trái nhỏ hơn nút gốc [Đoạn 1]."})
        with patch.object(main, "_answer_with_checkpoint", return_value=no_answer), patch.object(
            main.httpx, "AsyncClient", FakeAsyncClient
        ):
            response = self.client.post(
                "/answer",
                json={"question": "Tính chất khóa ở cây con trái?", "context": "[Đoạn 1] Khóa trái nhỏ hơn nút gốc."},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["model_mode"], "ollama_fallback")
        self.assertEqual(response.json()["answer"], "Khóa trái nhỏ hơn nút gốc [Đoạn 1].")
        self.assertEqual(FakeAsyncClient.calls[0][1]["model"], main.OLLAMA_MODEL)

    def test_answer_falls_back_when_checkpoint_span_is_too_short(self):
        short_answer = {
            "answer": "**Trả lời:** nhỏ hơn",
            "score": 0.8,
            "model_mode": "finetuned_qa",
            "model": "fine-tuned:test",
            "citations": [1],
        }
        FakeAsyncClient.response = FakeResponse({"response": "Khóa bên trái nhỏ hơn khóa nút gốc [Đoạn 1]."})
        with patch.object(main, "_answer_with_checkpoint", return_value=short_answer), patch.object(
            main.httpx, "AsyncClient", FakeAsyncClient
        ):
            response = self.client.post(
                "/answer",
                json={"question": "Tính chất khóa ở cây con trái?", "context": "[Đoạn 1] Khóa trái nhỏ hơn nút gốc."},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["model_mode"], "ollama_fallback")

    def test_embed_returns_batch_embeddings_from_local_model(self):
        vectors = [[0.1, 0.2], [0.3, 0.4]]
        with patch.object(main, "_encode_texts", return_value=vectors) as encode:
            response = self.client.post("/embed", json={"input": ["first", "second"]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["embeddings"], vectors)
        self.assertEqual(response.json()["model"], main.AI_EMBEDDING_MODEL)
        encode.assert_called_once_with(["first", "second"])

    def test_rejects_empty_embedding_items(self):
        with patch.object(main.httpx, "AsyncClient", FakeAsyncClient):
            response = self.client.post("/embed", json={"input": ["valid", " "]})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(FakeAsyncClient.calls, [])

    def test_ocr_rejects_non_pdf(self):
        response = self.client.post("/ocr", content=b"not a pdf", headers={"Content-Type": "application/pdf"})
        self.assertEqual(response.status_code, 415)

    def test_health_reports_missing_local_models(self):
        FakeAsyncClient.response = FakeResponse({"models": []})
        with patch.object(main.httpx, "AsyncClient", FakeAsyncClient), patch.object(
            main, "QA_CHECKPOINT_DIR", Path("missing-test-checkpoint")
        ):
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["status"], "models_missing")


if __name__ == "__main__":
    unittest.main()
