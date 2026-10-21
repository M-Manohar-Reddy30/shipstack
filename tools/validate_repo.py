#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = ROOT / "scenarios"

REQUIRED_FILES = [
    "README.md",
    "scenario.yaml",
    "requirements.md",
    "architecture.md",
    "data-model.md",
    "api.md",
    "security.md",
    "implementation.md",
    "testing.md",
    "observability.md",
    "deployment.md",
    "scaling.md",
    "failure-modes.md",
    "interview.md",
]

REQUIRED_METADATA = ("id", "name", "version", "status")


def main() -> int:
    errors = []

    if not SCENARIOS_DIR.is_dir():
        print("Validation FAILED:")
        print("  - scenarios/ directory does not exist.")
        return 1

    scenarios = sorted(
        path for path in SCENARIOS_DIR.iterdir()
        if path.is_dir() and not path.name.startswith(".")
    )

    if not scenarios:
        errors.append("No scenario directories found in scenarios/.")

    for scenario in scenarios:
        print(f"Checking scenario: {scenario.name}")

        for filename in REQUIRED_FILES:
            file_path = scenario / filename

            if not file_path.is_file():
                errors.append(f"{scenario.name}: missing {filename}")
                continue

            try:
                content = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                errors.append(f"{scenario.name}: {filename} is not valid UTF-8")
                continue
            except OSError as exc:
                errors.append(f"{scenario.name}: cannot read {filename}: {exc}")
                continue

            if not content.strip():
                errors.append(f"{scenario.name}: empty {filename}")

        metadata = scenario / "scenario.yaml"
        if not metadata.is_file():
            continue

        try:
            lines = metadata.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f"{scenario.name}/scenario.yaml: cannot read metadata: {exc}")
            continue

        values = {}
        for line in lines:
            match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$", line)
            if match:
                key, value = match.groups()
                value = value.split(" #", 1)[0].strip()
                if value and value.lower() not in ("null", "~", chr(34) * 2, chr(39) * 2):
                    values[key] = value

        for key in REQUIRED_METADATA:
            if key not in values:
                errors.append(
                    f"{scenario.name}/scenario.yaml: missing or empty {key}:"
                )

    if errors:
        print()
        print("Validation FAILED:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print()
    print(f"Validation PASSED: {len(scenarios)} scenario(s) checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
