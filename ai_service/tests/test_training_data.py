import unittest

from app.training.prepare_dataset import load_records, stratified_split


class DatasetPreparationTests(unittest.TestCase):
    def test_seed_data_has_answerable_and_unanswerable_vietnamese_rows(self):
        records = load_records()
        answerable = [row for row in records if not row["is_impossible"]]
        unanswerable = [row for row in records if row["is_impossible"]]

        self.assertEqual(len(records), 42)
        self.assertEqual(len(answerable), 36)
        self.assertEqual(len(unanswerable), 6)
        for row in answerable:
            answer = row["answers"][0]
            start = row["answer_start"]
            self.assertEqual(row["context"][start:start + len(answer)].casefold(), answer.casefold())
        self.assertTrue(all(not row["answers"] and row["answer_start"] is None for row in unanswerable))

    def test_topic_splits_are_deterministic_and_cover_every_topic(self):
        records = load_records()
        first = stratified_split(records, seed=7)
        second = stratified_split(records, seed=7)

        self.assertEqual(
            {name: [row["id"] for row in rows] for name, rows in first.items()},
            {name: [row["id"] for row in rows] for name, rows in second.items()},
        )
        topics = {row["topic"] for row in records}
        for rows in first.values():
            self.assertEqual({row["topic"] for row in rows}, topics)


if __name__ == "__main__":
    unittest.main()
