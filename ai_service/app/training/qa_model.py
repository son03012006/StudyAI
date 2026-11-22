import re
import string

import torch
from transformers import AutoModelForQuestionAnswering, AutoTokenizer


BASE_MODEL = "deepset/xlm-roberta-base-squad2"
MAX_LENGTH = 256
MAX_ANSWER_TOKENS = 32


def build_feature(tokenizer, row: dict, max_length: int = MAX_LENGTH) -> dict:
    encoded = tokenizer(
        row["question"],
        row["context"],
        truncation="only_second",
        max_length=max_length,
        padding="max_length",
        return_offsets_mapping=True,
    )
    offsets = encoded.pop("offset_mapping")
    sequence_ids = encoded.sequence_ids()
    context_tokens = [index for index, sequence_id in enumerate(sequence_ids) if sequence_id == 1]
    answer_start = row.get("answer_start")

    start_position = end_position = tokenizer.cls_token_id
    cls_position = encoded["input_ids"].index(tokenizer.cls_token_id)
    start_position = end_position = cls_position
    if answer_start is not None and context_tokens:
        answer = next(
            (text for text in row.get("answers", []) if row["context"][answer_start:answer_start + len(text)].casefold() == text.casefold()),
            None,
        )
        if answer:
            answer_end = answer_start + len(answer)
            token_start = next(
                (index for index in context_tokens if offsets[index][0] <= answer_start < offsets[index][1]),
                None,
            )
            token_end = next(
                (index for index in reversed(context_tokens) if offsets[index][0] < answer_end <= offsets[index][1]),
                None,
            )
            if token_start is not None and token_end is not None and token_end - token_start < MAX_ANSWER_TOKENS:
                start_position, end_position = token_start, token_end

    return {
        "input_ids": torch.tensor(encoded["input_ids"], dtype=torch.long),
        "attention_mask": torch.tensor(encoded["attention_mask"], dtype=torch.long),
        "start_positions": torch.tensor(start_position, dtype=torch.long),
        "end_positions": torch.tensor(end_position, dtype=torch.long),
        "context_mask": torch.tensor([sequence_id == 1 for sequence_id in sequence_ids], dtype=torch.bool),
    }


def normalize_answer(text: str) -> str:
    text = text.lower().translate(str.maketrans("", "", string.punctuation))
    return " ".join(text.split())


def exact_match(prediction: str, references: list[str]) -> float:
    normalized = normalize_answer(prediction)
    return float(any(normalized == normalize_answer(reference) for reference in references))


def token_f1(prediction: str, references: list[str]) -> float:
    prediction_tokens = normalize_answer(prediction).split()
    if not references:
        return float(not prediction_tokens)
    scores = []
    for reference in references:
        reference_tokens = normalize_answer(reference).split()
        common = set(prediction_tokens) & set(reference_tokens)
        overlap = sum(min(prediction_tokens.count(token), reference_tokens.count(token)) for token in common)
        if not prediction_tokens or not reference_tokens:
            scores.append(float(prediction_tokens == reference_tokens))
            continue
        precision = overlap / len(prediction_tokens)
        recall = overlap / len(reference_tokens)
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return max(scores)


def load_model(model_path: str, local_files_only: bool = False):
    tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True, local_files_only=local_files_only)
    model = AutoModelForQuestionAnswering.from_pretrained(model_path, local_files_only=local_files_only)
    model.eval()
    return tokenizer, model


def predict_one(tokenizer, model, question: str, context: str, max_length: int = MAX_LENGTH) -> dict:
    encoded = tokenizer(
        question,
        context,
        return_tensors="pt",
        truncation="only_second",
        max_length=max_length,
        return_offsets_mapping=True,
    )
    offsets = encoded.pop("offset_mapping")[0].tolist()
    sequence_ids = encoded.sequence_ids(0)
    context_positions = [index for index, value in enumerate(sequence_ids) if value == 1]
    if not context_positions:
        return {"answer": "", "score": 0.0, "start": -1, "end": -1}

    with torch.inference_mode():
        output = model(**encoded)
    start_logits = output.start_logits[0]
    end_logits = output.end_logits[0]
    cls_position = encoded["input_ids"][0].tolist().index(tokenizer.cls_token_id)
    best = None
    for start in context_positions:
        max_end = min(start + MAX_ANSWER_TOKENS, context_positions[-1] + 1)
        for end in range(start, max_end):
            if end not in context_positions:
                break
            score = float(start_logits[start] + end_logits[end])
            if best is None or score > best[0]:
                best = (score, offsets[start][0], offsets[end][1])
    null_score = float(start_logits[cls_position] + end_logits[cls_position])
    if best is None or best[1] >= best[2] or null_score - best[0] > 0:
        return {"answer": "", "score": 0.0, "start": -1, "end": -1}
    return {
        "answer": context[best[1]:best[2]].strip(),
        "score": float(torch.sigmoid(torch.tensor(best[0] - null_score))),
        "start": best[1],
        "end": best[2],
    }


def evaluate(tokenizer, model, examples: list[dict], max_length: int = MAX_LENGTH) -> dict:
    if not examples:
        return {"count": 0, "exact_match": 0.0, "token_f1": 0.0}
    exact_scores = []
    f1_scores = []
    for example in examples:
        prediction = predict_one(tokenizer, model, example["question"], example["context"], max_length)["answer"]
        references = example.get("answers", [])
        exact_scores.append(exact_match(prediction, references))
        f1_scores.append(token_f1(prediction, references))
    return {
        "count": len(examples),
        "exact_match": sum(exact_scores) / len(exact_scores),
        "token_f1": sum(f1_scores) / len(f1_scores),
    }
