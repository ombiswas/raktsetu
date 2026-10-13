"""
Authentication and security middleware for RaktSetu ML Service.
Requires 'Authorization: Bearer <ML_SERVICE_TOKEN>', verified via constant-time hmac.compare_digest.
"""

import hmac
import os
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

DEFAULT_DEV_TOKEN = "raktsetu-dev-ml-token-secret-2026"


def get_expected_token() -> str:
    return os.environ.get("ML_SERVICE_TOKEN", DEFAULT_DEV_TOKEN).strip()


def verify_ml_service_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    """
    Validates Bearer token using constant-time comparison to prevent timing attacks.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization scheme. Expected 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    provided_token = parts[1]
    expected_token = get_expected_token()

    if not hmac.compare_digest(provided_token.encode("utf-8"), expected_token.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired ML service token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return provided_token


MLAuthDependency = Annotated[str, Depends(verify_ml_service_token)]
