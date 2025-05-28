import re
import sys


def patch_connector(tag):
    """Patches the connector version within the data connector file"""
    pq_file = "/src/powerbi-data-connector/Speckle.pq"

    with open(pq_file, "r") as file:
        lines = file.readlines()

        for (index, line) in enumerate(lines):
            if '[Version = "3.0.0"]' in line:
                lines[index] = f'[Version = "{tag}"]\n'
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
