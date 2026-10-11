"""Exercise the actual pytest hooks, including xdist, without a Docker daemon."""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from textwrap import dedent

import pytest


@pytest.mark.parametrize(
    ("test_source", "args", "expected_skipped", "expected_probes", "docker_mode", "expected_exit"),
    [
        ("def test_db(db_session): assert False", [], 1, 1, "constructor_error", 0),
        ("def test_db(db_session): assert False", ["-n", "4"], 1, 1, "constructor_error", 0),
        ("import pytest\n@pytest.mark.requires_s3\ndef test_s3(): assert False", [], 1, 1, "constructor_error", 0),
        ("def test_redis(valkey_container): assert False", [], 1, 1, "constructor_error", 0),
        ("def test_unit(): pass", [], 0, 0, "constructor_error", 0),
        ("def test_unit(): pass", ["-n", "2"], 0, 1, "constructor_error", 0),
        ("def test_db(db_session): assert False", ["--collect-only"], 0, 0, "constructor_error", 0),
        ("def test_redis(valkey_container): assert False", [], 1, 1, "ping_error", 0),
        ("def test_redis(valkey_container): assert False", [], 1, 1, "ping_false", 0),
        (
            "import pytest\n@pytest.fixture\ndef valkey_container(): return 'ready'\ndef test_redis(valkey_container): assert valkey_container == 'ready'",
            [],
            0,
            1,
            "available",
            0,
        ),
        ("def test_db(db_session): assert False\ndef test_unit(): pass", ["-n", "4"], 1, 1, "constructor_error", 0),
        ("def test_dynamic(request): request.getfixturevalue('valkey_container')", ["-n", "4"], 1, 1, "constructor_error", 0),
        ("def test_db(db_session): assert False", ["--require-docker"], 0, 1, "constructor_error", 4),
        ("def test_db(db_session): assert False", ["--require-docker", "-n", "4"], 0, 1, "constructor_error", 4),
        ("def test_db(db_session): assert False", ["--require-docker", "--collect-only"], 0, 0, "constructor_error", 0),
    ],
)
def test_docker_preflight_skips_only_container_tests(tmp_path, test_source, args, expected_skipped, expected_probes, docker_mode, expected_exit):
    shutil.copyfile(Path(__file__).with_name("conftest.py"), tmp_path / "conftest.py")
    (tmp_path / "pytest.ini").write_text("[pytest]\nmarkers = requires_s3: real S3\n", encoding="utf-8")
    (tmp_path / "test_example.py").write_text(test_source + "\n", encoding="utf-8")
    (tmp_path / "docker_probe_plugin.py").write_text(
        dedent("""\
            from pathlib import Path
            import os
            import docker
            from testcontainers.core.container import DockerContainer

            class FakeClient:
                def ping(self):
                    mode = os.environ['PREFLIGHT_TEST_MODE']
                    if mode == 'ping_error':
                        raise docker.errors.DockerException('SECRET ping traceback')
                    return mode == 'available'

                def close(self):
                    Path('closed').write_text('closed')

            def unavailable(**kwargs):
                assert kwargs['timeout'] == 2
                assert kwargs['version'] != 'auto'
                with Path('probes').open('a') as log:
                    log.write('probe\\n')
                if os.environ['PREFLIGHT_TEST_MODE'] == 'constructor_error':
                    raise docker.errors.DockerException('SECRET noisy connection traceback')
                return FakeClient()

            def forbidden_start(*args, **kwargs):
                raise AssertionError('Container startup must never be reached')

            docker.from_env = unavailable
            DockerContainer.start = forbidden_start
            """),
        encoding="utf-8",
    )
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(tmp_path)
    environment["PREFLIGHT_TEST_MODE"] = docker_mode
    environment["DOCKER_HOST"] = "unix:///tmp/viewport-missing-docker.sock"
    # Subprocesses load only the plugins needed for these hook checks.
    environment["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
    environment.pop("PYTEST_ADDOPTS", None)
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-p", "docker_probe_plugin", "-p", "xdist.plugin", "-p", "pytest_asyncio.plugin", "-q", *args],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    output = result.stdout + result.stderr
    assert result.returncode == expected_exit, output
    probes = (tmp_path / "probes").read_text().splitlines() if (tmp_path / "probes").exists() else []
    assert len(probes) == expected_probes, output
    if docker_mode != "constructor_error":
        assert (tmp_path / "closed").exists(), output
    assert "SECRET" not in output
    assert "Container startup must never be reached" not in output
    assert "Traceback" not in output
    if expected_skipped:
        assert "Docker is unavailable" in output
        assert "Start Docker" in output
        assert f"{expected_skipped} skipped" in output
        assert output.count("Docker is unavailable") == 1
        assert output.count("WARNING: INCOMPLETE VALIDATION") == 1
        assert "SKIPPED, not passed" in output
        assert "exit code 0 does NOT mean all checks passed" in output
        assert "AI agents must report this run as incomplete" in output
    else:
        assert "WARNING: INCOMPLETE VALIDATION" not in output
    if expected_exit:
        assert "Required Docker validation failed" in output
        assert "Docker is unavailable" in output
        assert "skipped" not in output
    assert "ERROR collecting" not in output
    if "def test_unit(): pass" in test_source:
        assert "1 passed" in output
