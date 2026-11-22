import argparse
import hashlib
import json
import random
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "dataset" / "source" / "curated_qa.jsonl"
UNANSWERABLE_SOURCE = ROOT / "dataset" / "source" / "curated_unanswerable.jsonl"
OUTPUT = ROOT / "dataset" / "processed"
SEED = 42


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    return re.sub(r"\s+", " ", value).strip()


def load_records() -> list[dict]:
    records = []
    seen = set()
    with SOURCE.open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            row["context"] = normalize_text(row["context"])
            row["question"] = normalize_text(row["question"])
            row["answers"] = [normalize_text(answer) for answer in row["answers"] if normalize_text(answer)]
            if not row.get("context") or not row.get("question") or not row.get("topic"):
                raise ValueError(f"{SOURCE}:{line_number}: context, question, and topic are required.")

            key = (row["topic"], row["question"].casefold(), row["context"].casefold())
            if key in seen:
                continue
            seen.add(key)

            occurrences = []
            for answer in row["answers"]:
                position = row["context"].casefold().find(answer.casefold())
                if position >= 0:
                    occurrences.append((position, answer))
            if row["answers"] and not occurrences:
                raise ValueError(f"{SOURCE}:{line_number}: no answer occurs in its context.")
            if occurrences:
                row["answers"] = [answer for _, answer in occurrences]
                row["answer_start"] = occurrences[0][0]
                row["is_impossible"] = False
            else:
                row["answer_start"] = None
                row["is_impossible"] = True
            records.append(row)
    with UNANSWERABLE_SOURCE.open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            row["context"] = normalize_text(row["context"])
            row["question"] = normalize_text(row["question"])
            if row.get("answers"):
                raise ValueError(f"{UNANSWERABLE_SOURCE}:{line_number}: unanswerable rows must have no answer.")
            row["answers"] = []
            if not row.get("context") or not row.get("question") or not row.get("topic"):
                raise ValueError(f"{UNANSWERABLE_SOURCE}:{line_number}: context, question, and topic are required.")
            row["answer_start"] = None
            row["is_impossible"] = True
            key = (row["topic"], row["question"].casefold(), row["context"].casefold())
            if key not in seen:
                seen.add(key)
                records.append(row)
    return records


def stratified_split(records: list[dict], seed: int) -> dict[str, list[dict]]:
    grouped = defaultdict(list)
    for row in records:
        grouped[row["topic"]].append(row)

    splits = {"train": [], "validation": [], "test": []}
    for topic in sorted(grouped):
        examples = grouped[topic]
        random.Random(f"{seed}:{topic}").shuffle(examples)
        if len(examples) < 3:
            raise ValueError(f"Topic {topic!r} needs at least three examples to split.")
        test_count = max(1, round(len(examples) * 0.15))
        validation_count = max(1, round(len(examples) * 0.15))
        while test_count + validation_count >= len(examples):
            if validation_count >= test_count:
                validation_count -= 1
            else:
                test_count -= 1
        splits["test"].extend(examples[:test_count])
        splits["validation"].extend(examples[test_count:test_count + validation_count])
        splits["train"].extend(examples[test_count + validation_count:])

    for name in splits:
        random.Random(f"{seed}:{name}").shuffle(splits[name])
    return splits


def prepare(seed: int = SEED) -> dict:
    records = load_records()
    splits = stratified_split(records, seed)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with (OUTPUT / f"{name}.jsonl").open("w", encoding="utf-8", newline="\n") as file:
            for row in rows:
                file.write(json.dumps(row, ensure_ascii=False) + "\n")

    digest = hashlib.sha256(SOURCE.read_bytes() + UNANSWERABLE_SOURCE.read_bytes()).hexdigest()
    manifest = {
        "source_files": [str(SOURCE.relative_to(ROOT)), str(UNANSWERABLE_SOURCE.relative_to(ROOT))],
        "source_sha256": digest,
        "seed": seed,
        "license": "CC-BY-4.0",
        "topic_counts": {topic: sum(row["topic"] == topic for row in records) for topic in sorted({r["topic"] for r in records})},
        "split_counts": {name: len(rows) for name, rows in splits.items()},
        "total_records": len(records),
        "normalization": "Unicode NFC and collapsed whitespace",
        "duplicate_key": "topic + normalized question + normalized context",
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean, deduplicate, and split the original StudyAI QA dataset.")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    manifest = prepare(args.seed)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
