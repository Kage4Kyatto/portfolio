#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path


DATA_FILE = Path(__file__).resolve().parents[2] / "backend" / "php" / "data" / "messages.json"


def main() -> None:
    raw = DATA_FILE.read_text(encoding="utf-8")
    messages = json.loads(raw)

    print("Message Report")
    print(f"Total messages: {len(messages)}")

    by_email = Counter(entry.get("email", "").lower() for entry in messages if entry.get("email"))
    top_three = by_email.most_common(3)

    print("Top senders:")
    if not top_three:
        print("- none")
        return

    for email, total in top_three:
        print(f"- {email}: {total}")


if __name__ == "__main__":
    main()
