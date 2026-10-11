import subprocess
import sys
from pathlib import Path
from textwrap import dedent


def test_alembic_keeps_existing_application_loggers_enabled() -> None:
    """Run real Alembic logging setup without changing pytest's process logging."""
    repo_root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            dedent("""\
                import io
                import logging
                from alembic import command
                from alembic.config import Config
                from viewport.s3_service import logger

                assert not logger.disabled
                config = Config("alembic.ini", output_buffer=io.StringIO())
                # Offline base runs env.py without opening a database connection.
                for _ in range(2):
                    command.upgrade(config, "base", sql=True)
                    assert not logger.disabled, "Alembic disabled the S3 logger"

                output = io.StringIO()
                logger.addHandler(logging.StreamHandler(output))
                logger.error("S3 credential validation failed")
                assert "S3 credential validation failed" in output.getvalue()
                """),
        ],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
