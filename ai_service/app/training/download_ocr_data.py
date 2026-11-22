import hashlib
import json
import os
import tempfile
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[2]
DESTINATION_DIR = ROOT / "models" / "tessdata"
FILES = {
    "eng.traineddata": "bbef4675053b5b468cdb477053e28b1c698ba08e",
    "vie.traineddata": "e54a5912fb634c581c4a45ae9f37cbc021ec7140",
}


def git_blob_sha1(content: bytes) -> str:
    return hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest()


def main() -> None:
    DESTINATION_DIR.mkdir(parents=True, exist_ok=True)
    verified = []
    for filename, expected_sha in FILES.items():
        destination = DESTINATION_DIR / filename
        if destination.is_file() and git_blob_sha1(destination.read_bytes()) == expected_sha:
            verified.append(filename)
            continue

        url = f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{filename}"
        with urlopen(url, timeout=60) as response:
            content = response.read()
        actual_sha = git_blob_sha1(content)
        if actual_sha != expected_sha:
            raise ValueError(f"{filename} Git blob SHA-1 mismatch: {actual_sha}")

        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(dir=DESTINATION_DIR, delete=False) as temporary_file:
                temporary_path = Path(temporary_file.name)
                temporary_file.write(content)
            os.replace(temporary_path, destination)
        finally:
            if temporary_path and temporary_path.exists():
                temporary_path.unlink()
        verified.append(filename)
    print(json.dumps({"directory": str(DESTINATION_DIR), "files": verified, "verified": True}))


if __name__ == "__main__":
    main()
