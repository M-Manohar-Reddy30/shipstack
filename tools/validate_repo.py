#!/usr/bin/env python3
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

def main() -> int:
    errors = []
    scenarios = sorted(
        path for path in SCENARIOS_DIR.iterdir()
        if path.is_dir() and not path.name.startswith(".")
    ) if SCENARIOS_DIR.exists() else []

    if not scenarios:
        errors.append("No scenario directories found in scenarios/.")

    for scenario in scenarios:
        print(f"Checking scenario: {scenario.name}")
        for filename in REQUIRED_FILES:
            file_path = scenario / filename
            if not file_path.is_file():
                errors.append(f"{scenario.name}: missing {filename}")
            elif file_path.stat().st_size == 0:
                errors.append(f"{scenario.name}: empty {filename}")

        metadata = scenario / "scenario.yaml"
        if metadata.is_file() and metadata.stat().st_size > 0:
            content = metadata.read_text(encoding="utf-8")
            for key in ("id:", "name:", "version:", "status:"):
                if not any(line.strip().startswith(key) for line in content.splitlines()):
                    errors.append(f"{scenario.name}/scenario.yaml: missing {key}")

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
