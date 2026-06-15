#!/usr/bin/env python3
from pathlib import Path
import re


PUBLIC_DIR = Path(__file__).resolve().parents[2] / "public"
PAGE_FILES = [
    "index.html",
    "about.html",
    "projects.html",
    "services.html",
    "contact.html",
    "admin.html",
]


def extract_first(content: str, pattern: str) -> str:
    match = re.search(pattern, content, re.IGNORECASE)
    if not match:
        return "missing"
    return match.group(1).strip()


def inspect_page(file_name: str) -> tuple[str, str, str, int]:
    content = (PUBLIC_DIR / file_name).read_text(encoding="utf-8")
    title = extract_first(content, r"<title>([^<]+)</title>")
    description = extract_first(content, r'<meta\s+name="description"\s+content="([^"]*)"')
    section_count = len(re.findall(r"<section\b", content, re.IGNORECASE))
    return file_name, title, description, section_count


def main() -> None:
    print("Site Report")
    for file_name in PAGE_FILES:
        page_name, title, description, section_count = inspect_page(file_name)
        print(f"- {page_name}")
        print(f"  title: {title}")
        print(f"  description: {description}")
        print(f"  sections: {section_count}")


if __name__ == "__main__":
    main()