import re
import sys
import os


def sanitize_version(tag):
    """Extracts the first three numeric segments from a tag string, because PowerBI is..."""
    parts = re.findall(r"\d+", tag)
    return ".".join(parts[:3]) if len(parts) >= 3 else tag

def patch_connector(tag):
    """Patches the connector version within the data connector file"""
    sanitized_tag = sanitize_version(tag)
    pq_file = os.path.join(os.path.dirname(__file__), "src", "powerbi-data-connector", "Speckle.pq")

    with open(pq_file, "r") as file:
        lines = file.readlines()

        for (index, line) in enumerate(lines):
            if '[Version = "3.0.0"]' in line:
                lines[index] = f'[Version = "{sanitized_tag}"]\n'
                print(f"Patched connector version number in {pq_file}")
                break

        with open(pq_file, "w") as file:
            file.writelines(lines)


def main():
    if len(sys.argv) < 2:
        return

    tag = sys.argv[1]
    if not re.match(r"([0-9]+)\.([0-9]+)\.([0-9]+)", tag):
        raise ValueError(f"Invalid tag provided: {tag}")

    print(f"Patching version: {tag}")
    patch_connector(tag)


if __name__ == "__main__":
    main()
