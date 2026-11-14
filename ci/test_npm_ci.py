"""Offline checks for release npm fallback and legacy Dockerfile injection."""

import base64
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

CI_DIR = Path(__file__).resolve().parent


class NpmFallbackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        npm = self.root / "npm"
        npm.write_text(
            """#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
case "$*" in
  *--registry=https://primary.example*)
    if test "${STALL_PRIMARY:-0}" = 1; then exec sleep 5; fi
    exit "${PRIMARY_STATUS:-0}" ;;
  *) exit "${FALLBACK_STATUS:-0}" ;;
esac
"""
        )
        npm.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": f"{self.root}:{os.environ['PATH']}",
            "CALLS": str(self.root / "calls"),
            "CI_NPM_REGISTRIES": "https://primary.example https://fallback.example",
            "CI_NPM_INSTALL_TIMEOUT": "10",
            "PRIMARY_STATUS": "0",
            "FALLBACK_STATUS": "0",
            "STALL_PRIMARY": "0",
        }

    def run_installer(self, **env):
        result = subprocess.run(
            ["sh", str(CI_DIR / "npm-ci.sh"), "--include=dev", "--loglevel=http"],
            env={**self.env, **env},
            capture_output=True,
            text=True,
            timeout=10,
        )
        calls = self.root / "calls"
        return result, calls.read_text().splitlines() if calls.exists() else []

    def test_primary_success_does_not_contact_fallback(self):
        result, calls = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 1)
        for arg in (
            "ci --include=dev --loglevel=http",
            "--registry=https://primary.example",
            "--replace-registry-host=npmjs",
            "--prefer-offline",
            "--fetch-timeout=20000",
            "--fetch-retries=1",
        ):
            self.assertIn(arg, calls[0])

    def test_primary_failure_uses_next_registry(self):
        result, calls = self.run_installer(PRIMARY_STATUS="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 2)
        self.assertIn("--registry=https://fallback.example", calls[1])

    def test_all_failures_fail_the_build(self):
        result, calls = self.run_installer(PRIMARY_STATUS="1", FALLBACK_STATUS="7")
        self.assertEqual(result.returncode, 7)
        self.assertEqual(len(calls), 2)
        self.assertIn("failed for every configured registry", result.stderr)

    def test_timeout_advances_to_next_registry(self):
        started = time.monotonic()
        result, calls = self.run_installer(STALL_PRIMARY="1", CI_NPM_INSTALL_TIMEOUT="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 2)
        self.assertLess(time.monotonic() - started, 4)

    def test_invalid_config_is_rejected_before_install(self):
        for config in (
            {"CI_NPM_REGISTRIES": "https://primary.example http://fallback.example"},
            {"CI_NPM_INSTALL_TIMEOUT": "0"},
            {"CI_NPM_INSTALL_TIMEOUT": "invalid"},
        ):
            with self.subTest(config=config):
                result, calls = self.run_installer(**config)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(calls, [])


class DockerfileInjectionTests(unittest.TestCase):
    def prepare(self, source):
        encoded = base64.b64encode((CI_DIR / "npm-ci.sh").read_bytes()).decode()
        return subprocess.run(
            ["awk", "-v", f"install_script={encoded}", "-f", str(CI_DIR / "prepare-frontend.awk")],
            input=source,
            capture_output=True,
            text=True,
        )

    def test_supports_legacy_and_cache_mounted_install_steps(self):
        for install in (
            "RUN npm ci --include=dev",
            "RUN --mount=type=cache,target=/root/.npm npm ci --include=dev",
        ):
            with self.subTest(install=install):
                source = f"FROM node:24-alpine AS build\n{install} \\\n  || exit 1\nRUN npm run build\nFROM nginx AS runtime\n"
                result = self.prepare(source)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(
                    install.replace("npm ci", "sh /usr/local/bin/viewport-npm-ci"),
                    result.stdout,
                )
                self.assertIn("  || exit 1\nRUN npm run build", result.stdout)
                embedded = result.stdout.split("RUN printf '%s' '", 1)[1].split("'", 1)[0]
                self.assertEqual(base64.b64decode(embedded), (CI_DIR / "npm-ci.sh").read_bytes())
                self.assertEqual(result.stdout.count("ARG CI_NPM_REGISTRIES\n"), 1)
                self.assertTrue(result.stdout.endswith("FROM nginx AS runtime\n"))

    def test_missing_install_step_fails(self):
        self.assertNotEqual(self.prepare("FROM node:24-alpine\nRUN npm install\n").returncode, 0)


if __name__ == "__main__":
    unittest.main()
