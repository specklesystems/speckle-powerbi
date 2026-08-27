import re
import sys
import os

VERSION_ATTR_PATTERN = re.compile(r'\[Version = "[^"]*"\]')


def sanitize_version(tag):
    """Extracts the first three numeric segments from a tag string, because PowerBI is..."""
    parts = re.findall(r"\d+", tag)
    return ".".join(parts[:3]) if len(parts) >= 3 else tag


def patch_connector(tag):
    """Patches the connector version within the data connector file"""
    sanitized_tag = sanitize_version(tag)
    pq_file = os.path.join(os.path.dirname(__file__), "src", "powerbi-data-connector", "Speckle.pq")

    with open(pq_file, "r") as file:
        content = file.read()

    # match ANY current placeholder value — a hand-bumped placeholder must
    # never silently defeat the release patch (it did once: [Version = "4.0.0"]
    # vs a script that only looked for the literal 3.0.0)
    patched, count = VERSION_ATTR_PATTERN.subn(f'[Version = "{sanitized_tag}"]', content, count=1)
    if count == 0:
        raise SystemExit(f'ERROR: no [Version = "..."] attribute found in {pq_file} - connector version was NOT patched')

    with open(pq_file, "w") as file:
        file.write(patched)
    print(f"Patched connector version to {sanitized_tag} in {pq_file}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("ERROR: no version tag provided - usage: patch_version.py <tag>")

    tag = sys.argv[1]
    if not re.match(r"([0-9]+)\.([0-9]+)\.([0-9]+)", tag):
        raise ValueError(f"Invalid tag provided: {tag}")

    print(f"Patching version: {tag}")
    patch_connector(tag)


if __name__ == "__main__":
    main()
