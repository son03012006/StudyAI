# Vietnamese educational QA dataset

`source/curated_qa.jsonl` and `source/curated_unanswerable.jsonl` contain original Vietnamese question/context/answer-span examples written for this project across programming, data structures and algorithms, databases, operating systems, mathematics, and academic study skills. The latter teaches the extractive reader to abstain when its context does not contain an answer.

- **Author/source:** StudyAI project contributors; original educational prose, not copied from textbooks or an external answer corpus.
- **Dataset license:** Creative Commons Attribution 4.0 International (CC BY 4.0), see `LICENSE`.
- **Preprocessing:** `python -m app.training.prepare_dataset`; normalizes whitespace, rejects missing/ambiguous answer spans, removes normalized duplicate question/context pairs, and creates deterministic stratified train/validation/test splits.
- **Split protocol:** deterministic, approximately 70% train / 15% validation / 15% held-out test within each topic, with seed 42 and at least one validation/test row per topic. A content hash and actual counts are recorded in the generated manifest.
- **External evaluation:** Google XQuAD Vietnamese is only an additional external evaluation set, not training data. Its dataset card declares CC BY-SA 4.0 and it contains a single 1,190-example validation split. The evaluation script downloads its published Parquet file and verifies the recorded SHA-256 before use.

This is a small, human-authored seed set intended for a reproducible fine-tuning demonstration, not a comprehensive or statistically representative Vietnamese curriculum. All performance metrics must come from the training/evaluation scripts and saved run metadata.
