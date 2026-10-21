import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = REPO_ROOT / "tools" / "validate_repo.py"


class ValidateRepoTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        shutil.copytree(REPO_ROOT / "scenarios", self.root / "scenarios")
        shutil.copytree(REPO_ROOT / "tools", self.root / "tools")

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_validator(self):
        return subprocess.run(
            ["python3", str(self.root / "tools" / "validate_repo.py")],
            cwd=self.root,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_missing_scenarios_directory_fails(self):
        shutil.rmtree(self.root / "scenarios")
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("scenarios/ directory does not exist", result.stdout)

    def test_valid_scenario_passes(self):
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Validation PASSED", result.stdout)

    def test_missing_required_file_fails(self):
        readme = self.root / "scenarios" / "authentication" / "README.md"
        readme.unlink()
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing README.md", result.stdout)

    def test_empty_documentation_fails(self):
        readme = self.root / "scenarios" / "authentication" / "README.md"
        readme.write_text("   \n\t\n")
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("empty README.md", result.stdout)

    def test_missing_required_metadata_field_fails(self):
        metadata = self.root / "scenarios" / "authentication" / "scenario.yaml"
        content = metadata.read_text(encoding="utf-8")
        metadata.write_text(
            "\n".join(line for line in content.splitlines() if not line.startswith("status:")) + "\n",
            encoding="utf-8",
        )
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing or empty status", result.stdout)

    def test_empty_metadata_value_fails(self):
        metadata = self.root / "scenarios" / "authentication" / "scenario.yaml"
        content = metadata.read_text(encoding="utf-8")
        metadata.write_text(
            content.replace(
                "name: Production-Grade Authentication",
                "name:",
                1,
            ),
            encoding="utf-8",
        )
        result = self.run_validator()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing or empty name", result.stdout)


if __name__ == "__main__":
    unittest.main()
