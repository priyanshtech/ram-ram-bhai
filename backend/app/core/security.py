import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.database import get_db
from app.models.models import TenantMember, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")
visitor_scheme = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except ValueError:
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(subject: str | Any, expires_delta: timedelta | None = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_visitor_session_token(bot_id: str, tenant_id: str, origin: str | None = None, expires_delta: timedelta | None = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # Visitor sessions last 24 hours by default
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
    
    session_id = str(uuid.uuid4())
    jti = str(uuid.uuid4())
    
    to_encode = {
        "exp": expire, 
        "sub": "visitor",
        "bot_id": bot_id,
        "tenant_id": tenant_id,
        "visitor_session_id": session_id,
        "jti": jti
    }
    if origin:
        to_encode["origin"] = origin
        
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

def require_tenant_access(allowed_roles: list[str] = ["owner", "admin", "agent", "viewer"]):
    async def get_current_tenant_member(
        tenant_id: str,
        current_user: User = Security(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> TenantMember:
        stmt = select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id
        )
        result = await db.execute(stmt)
        member = result.scalar_one_or_none()
        
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found or access denied."
            )
            
        if member.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions."
            )
            
        return member
    return get_current_tenant_member

async def get_visitor_session(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(visitor_scheme),
    db: AsyncSession = Depends(get_db)
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate visitor session",
    )
    if not credentials or credentials.scheme.lower() != "bearer":
        raise credentials_exception
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("sub") != "visitor":
            raise credentials_exception
        bot_id = payload.get("bot_id")
        tenant_id = payload.get("tenant_id")
        visitor_session_id = payload.get("visitor_session_id")
        if not bot_id or not tenant_id or not visitor_session_id:
            raise credentials_exception
            
        token_origin = payload.get("origin")
        request_origin = request.headers.get("origin")
        
        if token_origin:
            if not request_origin:
                raise HTTPException(status_code=403, detail="Origin header missing")
            if request_origin.lower() != token_origin.lower():
                raise HTTPException(status_code=403, detail="Origin mismatch")
                
        return {
            "bot_id": bot_id, 
            "tenant_id": tenant_id, 
            "visitor_session_id": visitor_session_id,
            "origin": token_origin
        }
    except JWTError:
        raise credentials_exception
