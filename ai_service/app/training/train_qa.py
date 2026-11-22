import argparse
import copy
import json
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset
from transformers import (
    __version__ as transformers_version,
    AutoModelForQuestionAnswering,
    AutoTokenizer,
    get_linear_schedule_with_warmup,
)

from app.training.prepare_dataset import prepare
from app.training.qa_model import BASE_MODEL, MAX_LENGTH, build_feature, evaluate


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "dataset" / "processed"
CHECKPOINT = ROOT / "checkpoints" / "studyai-xlm-roberta-viqa"
HISTORY = ROOT / "training_runs.jsonl"


class QADataset(Dataset):
    def __init__(self, tokenizer, rows: list[dict], max_length: int):
        self.features = [build_feature(tokenizer, row, max_length) for row in rows]

    def __len__(self):
        return len(self.features)

    def __getitem__(self, index):
        return self.features[index]


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune a multilingual extractive QA model on StudyAI's original Vietnamese QA set.")
    parser.add_argument("--model", default=BASE_MODEL)
    parser.add_argument("--output", type=Path, default=CHECKPOINT)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--max-length", type=int, default=MAX_LENGTH)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--threads", type=int, default=max(1, min(6, (os.cpu_count() or 2) - 2)))
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.max_length > 512:
        raise ValueError("epochs and batch size must be positive; max length cannot exceed 512.")

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads)
    device = torch.device("cpu")
    manifest = prepare(args.seed)
    train_rows = load_jsonl(DATA / "train.jsonl")
    validation_rows = load_jsonl(DATA / "validation.jsonl")
    test_rows = load_jsonl(DATA / "test.jsonl")

    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
    model = AutoModelForQuestionAnswering.from_pretrained(args.model)
    model.to(device)
    baseline = evaluate(tokenizer, model, test_rows, args.max_length)

    train_dataset = QADataset(tokenizer, train_rows, args.max_length)
    validation_dataset = QADataset(tokenizer, validation_rows, args.max_length)
    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    validation_loader = DataLoader(validation_dataset, batch_size=args.batch_size, shuffle=False)
    weight_decay = 0.01
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=args.learning_rate,
        weight_decay=weight_decay,
    )
    total_steps = max(1, len(train_loader) * args.epochs)
    scheduler = get_linear_schedule_with_warmup(optimizer, int(total_steps * 0.1), total_steps)
    epoch_history = []
    started = time.monotonic()
    started_at_utc = datetime.now(timezone.utc).isoformat()
    best_validation_loss = float("inf")
    best_model_state = None
    best_epoch = 0

    for epoch in range(args.epochs):
        model.train()
        running_loss = 0.0
        for batch in train_loader:
            batch = {key: value.to(device) for key, value in batch.items() if key != "context_mask"}
            optimizer.zero_grad(set_to_none=True)
            loss = model(**batch).loss
            if not torch.isfinite(loss):
                raise RuntimeError(f"Non-finite training loss at epoch {epoch + 1}.")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()
            running_loss += float(loss.detach())

        model.eval()
        validation_loss = 0.0
        with torch.inference_mode():
            for batch in validation_loader:
                batch = {key: value.to(device) for key, value in batch.items() if key != "context_mask"}
                validation_loss += float(model(**batch).loss)
        validation_loss /= max(1, len(validation_loader))
        metrics = evaluate(tokenizer, model, validation_rows, args.max_length)
        epoch_history.append({
            "epoch": epoch + 1,
            "train_loss": running_loss / max(1, len(train_loader)),
            "validation_loss": validation_loss,
            "validation": metrics,
        })
        print(json.dumps(epoch_history[-1], ensure_ascii=False), flush=True)
        if validation_loss < best_validation_loss:
            best_validation_loss = validation_loss
            best_model_state = copy.deepcopy(model.state_dict())
            best_epoch = epoch + 1

    if best_model_state is None:
        raise RuntimeError("Training completed without a finite validation checkpoint.")
    model.load_state_dict(best_model_state)
    test_metrics = evaluate(tokenizer, model, test_rows, args.max_length)
    args.output.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(args.output, safe_serialization=True)
    tokenizer.save_pretrained(args.output)
    metadata = {
        "model_type": "extractive-question-answering",
        "base_model": args.model,
        "base_model_license": "CC-BY-4.0",
        "model_card": "https://huggingface.co/deepset/xlm-roberta-base-squad2",
        "fine_tuned_checkpoint": str(args.output.resolve()),
        "dataset_manifest": manifest,
        "training": {
            "started_at_utc": started_at_utc,
            "seed": args.seed,
            "device": str(device),
            "threads": args.threads,
            "torch_version": torch.__version__,
            "transformers_version": transformers_version,
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.learning_rate,
            "optimizer": "AdamW",
            "weight_decay": weight_decay,
            "scheduler": "linear",
            "warmup_steps": int(total_steps * 0.1),
            "max_length": args.max_length,
            "best_epoch": best_epoch,
            "best_validation_loss": best_validation_loss,
            "train_examples": len(train_rows),
            "validation_examples": len(validation_rows),
            "test_examples": len(test_rows),
            "duration_seconds": round(time.monotonic() - started, 2),
        },
        "baseline_test": baseline,
        "fine_tuned_test": test_metrics,
        "epoch_history": epoch_history,
    }
    (args.output / "training_metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with HISTORY.open("a", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(metadata, ensure_ascii=False) + "\n")
    print(json.dumps({
        "checkpoint": str(args.output.resolve()),
        "baseline_test": baseline,
        "fine_tuned_test": test_metrics,
        "duration_seconds": metadata["training"]["duration_seconds"],
    }, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
