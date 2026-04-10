from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings
import hashlib, hmac, base64

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        # Vérifier si c'est un hash sha256 (fallback)
        if hashed_password.startswith("sha256:"):
            import hashlib
            salt = "farouk_manager_salt_2026"
            expected = "sha256:" + hashlib.sha256((salt + plain_password).encode()).hexdigest()
            return hashed_password == expected
        # Sinon bcrypt
        return pwd_context.verify(plain_password[:72], hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    try:
        result = pwd_context.hash(password[:72])
        # Vérifier que le hash fonctionne
        if pwd_context.verify(password[:72], result):
            return result
        raise Exception("Hash verification failed")
    except Exception:
        # Fallback: sha256 based hash
        import hashlib
        salt = "farouk_manager_salt_2026"
        return "sha256:" + hashlib.sha256((salt + password).encode()).hexdigest()

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
