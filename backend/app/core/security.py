from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings
import hashlib, hmac, base64

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

import hashlib as _hashlib

_SALT = "farouk_manager_salt_2026"

def _sha256_hash(password: str) -> str:
    return "sha256:" + _hashlib.sha256((_SALT + password).encode()).hexdigest()

def _sha256_verify(plain: str, hashed: str) -> bool:
    return hashed == _sha256_hash(plain)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith("sha256:"):
            return _sha256_verify(plain_password, hashed_password)
        return pwd_context.verify(plain_password[:72], hashed_password)
    except Exception:
        # Dernier recours: sha256
        return _sha256_verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    try:
        result = pwd_context.hash(password[:72])
        # Test que verify fonctionne
        pwd_context.verify(password[:72], result)
        return result
    except Exception:
        return _sha256_hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
