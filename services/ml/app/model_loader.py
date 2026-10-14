"""
Secure artifact verification and loading.
Enforces that NO artifact is ever unpickled unless its SHA-256 checksum
strictly matches the metadata record signed/saved locally.
"""

import hashlib
import hmac
import json
import logging
from pathlib import Path
from typing import Any

import joblib

logger = logging.getLogger("raktsetu.ml.loader")


class SecurityIntegrityError(Exception):
    """Raised when an artifact has been tampered with or failed checksum verification."""
    pass


def compute_sha256(file_path: Path) -> str:
    """Computes SHA-256 checksum of a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_and_load_artifact(
    artifact_path: Path, metadata_path: Path
) -> tuple[Any, dict[str, Any]]:
    """
    Verifies that the artifact file matches the SHA-256 checksum in metadata.json,
    refusing to load if mismatched. Never unpickles untrusted / modified artifacts.
    """
    if not artifact_path.exists():
        raise FileNotFoundError(f"Artifact not found at {artifact_path}")
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata not found at {metadata_path}")

    # 1. Read metadata
    with open(metadata_path, encoding="utf-8") as f:
        metadata = json.load(f)

    expected_checksum = metadata.get("sha256_checksum")
    if not expected_checksum or not isinstance(expected_checksum, str):
        raise SecurityIntegrityError("Metadata missing valid 'sha256_checksum' string")

    # 2. Compute actual artifact checksum
    actual_checksum = compute_sha256(artifact_path)

    # 3. Constant-time comparison
    if not hmac.compare_digest(actual_checksum.lower(), expected_checksum.lower()):
        raise SecurityIntegrityError(
            f"Artifact integrity compromised! Expected checksum {expected_checksum}, "
            f"got {actual_checksum}. Refusing to unpickle artifact."
        )

    logger.info(
        "Artifact integrity verified via SHA-256 (%s). Loading artifact safely.",
        actual_checksum[:12],
    )

    # 4. Safely load artifact
    model_obj = joblib.load(artifact_path)
    return model_obj, metadata
