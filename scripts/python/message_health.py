#!/usr/bin/env python3
import json
from pathlib import Path


DATA_FILE = Path(__file__).resolve().parents[2] / "backend" / "php" / "data" / "messages.json"
REQUIRED_FIELDS = ["name", "email", "subject", "message", "createdAt"]


def inspect_messages(messages: list[dict]) -> tuple[int, int, int]:
    total_messages = len(messages)
    incomplete_messages = 0
    longest_message_length = 0

    for entry in messages:
        if any(not entry.get(field) for field in REQUIRED_FIELDS):
            incomplete_messages += 1

        message_length = len(entry.get("message", ""))
        longest_message_length = max(longest_message_length, message_length)

    return total_messages, incomplete_messages, longest_message_length


def main() -> None:
    messages = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    total_messages, incomplete_messages, longest_message_length = inspect_messages(messages)

    print("Message Health")
    print(f"Total messages: {total_messages}")
    print(f"Incomplete messages: {incomplete_messages}")
    print(f"Longest message length: {longest_message_length}")


if __name__ == "__main__":
    main()