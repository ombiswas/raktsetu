"""
Tests for model artifact integrity verification and anti-tampering guards.
Refuses to unpickle any file whose SHA-256 checksum does not match signed metadata.
"""

import json
from pathlib import Path

import pytest

from app.model_loader import SecurityIntegrityError, compute_sha256, verify_and_load_artifact

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def test_valid_response_artifact_integrity() -> None:
    artifact_path = MODELS_DIR / "response_model.joblib"
    metadata_path = MODELS_DIR / "response_model.metadata.json"

    assert artifact_path.exists(), "response_model.joblib must exist"
    assert metadata_path.exists(), "response_model.metadata.json must exist"

    model_obj, metadata = verify_and_load_artifact(artifact_path, metadata_path)
    assert model_obj is not None
    assert metadata["simulation"] is True
    assert metadata["sha256_checksum"] == compute_sha256(artifact_path)


def test_refuse_loading_when_artifact_tampered(tmp_path: Path) -> None:
    artifact_path = MODELS_DIR / "response_model.joblib"
    metadata_path = MODELS_DIR / "response_model.metadata.json"

    # Copy files to temporary directory
    temp_artifact = tmp_path / "response_model.joblib"
    temp_metadata = tmp_path / "response_model.metadata.json"

    temp_artifact.write_bytes(artifact_path.read_bytes())
    temp_metadata.write_text(metadata_path.read_text(encoding="utf-8"), encoding="utf-8")

    # Corrupt one byte at the end of the artifact
    corrupted_bytes = bytearray(temp_artifact.read_bytes())
    corrupted_bytes[-1] ^= 0xFF
    temp_artifact.write_bytes(bytes(corrupted_bytes))

    # Verification must fail and raise SecurityIntegrityError
    with pytest.raises(SecurityIntegrityError, match="Artifact integrity compromised"):
        verify_and_load_artifact(temp_artifact, temp_metadata)


def test_refuse_loading_when_metadata_checksum_mismatched(tmp_path: Path) -> None:
    artifact_path = MODELS_DIR / "response_model.joblib"
    metadata_path = MODELS_DIR / "response_model.metadata.json"

    temp_artifact = tmp_path / "response_model.joblib"
    temp_metadata = tmp_path / "response_model.metadata.json"

    temp_artifact.write_bytes(artifact_path.read_bytes())
    meta = json.loads(metadata_path.read_text(encoding="utf-8"))
    meta["sha256_checksum"] = "0000000000000000000000000000000000000000000000000000000000000000"
    temp_metadata.write_text(json.dumps(meta), encoding="utf-8")

    with pytest.raises(SecurityIntegrityError, match="Artifact integrity compromised"):
        verify_and_load_artifact(temp_artifact, temp_metadata)
