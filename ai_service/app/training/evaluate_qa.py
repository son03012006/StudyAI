import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve

import pyarrow.parquet as parquet
import torch
from transformers import AutoModelForQuestionAnswering, AutoTokenizer

from app.training.prepare_dataset import OUTPUT, prepare
from app.training.qa_model import BASE_MODEL, MAX_LENGTH, evaluate, load_model


ROOT = Path(__file__).resolve().parents[2]
XQUAD_URL = (
    "https://huggingface.co/datasets/google/xquad/resolve/main/"
    "xquad.vi/validation-00000-of-00001.parquet?download=true"
)
XQUAD_SHA256 = "52442ff8696ea0efa6595c67f2cdbd1a366e12cdb0dcaabbe0855bc4b5724ced"
XQUAD_FILE = ROOT / "dataset" / "external" / "xquad_vi_validation.parquet"


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def download_xquad() -> list[dict]:
    XQUAD_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not XQUAD_FILE.exists():
        urlretrieve(XQUAD_URL, XQUAD_FILE)
    digest = hashlib.sha256(XQUAD_FILE.read_bytes()).hexdigest()
    if digest != XQUAD_SHA256:
        XQUAD_FILE.unlink(missing_ok=True)
        raise ValueError(f"XQuAD SHA-256 mismatch: expected {XQUAD_SHA256}, received {digest}.")
    table = parquet.read_table(XQUAD_FILE)
    rows = table.to_pylist()
    return [{
        "id": row["id"],
        "context": row["context"],
        "question": row["question"],
        "answers": row["answers"]["text"],
        "answer_start": row["answers"]["answer_start"][0] if row["answers"]["answer_start"] else None,
    } for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare base and fine-tuned model on held-out Vietnamese QA sets.")
    parser.add_argument("--checkpoint", type=Path, default=ROOT / "checkpoints" / "studyai-xlm-roberta-viqa")
    parser.add_argument("--xquad-limit", type=int, default=0, help="0 evaluates the complete 1,190-example XQuAD Vietnamese split.")
    parser.add_argument("--include-xquad", action="store_true")
    parser.add_argument("--threads", type=int, default=max(1, min(6, (torch.get_num_threads() or 4))))
    args = parser.parse_args()
    if not args.checkpoint.is_dir():
        raise FileNotFoundError(f"Fine-tuned checkpoint does not exist: {args.checkpoint}")
    prepare()
    test_rows = load_jsonl(OUTPUT / "test.jsonl")
    torch.set_num_threads(args.threads)

    cases = {"project_held_out_test": test_rows}
    if args.include_xquad:
        xquad_rows = download_xquad()
        cases["xquad_vi_external_test"] = xquad_rows[:args.xquad_limit] if args.xquad_limit else xquad_rows

    baseline_tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, use_fast=True)
    baseline_model = AutoModelForQuestionAnswering.from_pretrained(BASE_MODEL)
    tuned_tokenizer, tuned_model = load_model(str(args.checkpoint), local_files_only=True)
    results = {
        "base_model": BASE_MODEL,
        "fine_tuned_checkpoint": str(args.checkpoint.resolve()),
        "dataset_license": "project-held-out: CC-BY-4.0; XQuAD: CC-BY-SA-4.0",
        "results": {},
    }
    for name, rows in cases.items():
        results["results"][name] = {
            "base": evaluate(baseline_tokenizer, baseline_model, rows, MAX_LENGTH),
            "fine_tuned": evaluate(tuned_tokenizer, tuned_model, rows, MAX_LENGTH),
        }
        print(json.dumps({"set": name, **results["results"][name]}, ensure_ascii=False), flush=True)

    output = args.checkpoint / "evaluation.json"
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved actual evaluation results to {output}")


if __name__ == "__main__":
    main()
