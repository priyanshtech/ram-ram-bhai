import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.models.models import Bot, Tenant, TenantMember, User

router = APIRouter(prefix="/auth", tags=["Auth"])

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    tenant_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SupabaseLoginRequest(BaseModel):
    supabase_token: str
    is_signup: bool = False

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str
    bot_id: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    
@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user

@router.post("/signup", response_model=TokenResponse)
async def signup(req: SignupRequest, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    stmt = select(User).where(User.email == req.email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create User
    user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        full_name=req.full_name
    )
    db.add(user)
    await db.flush()

    # Create Default Tenant
    tenant = Tenant(
        name=req.tenant_name,
        plan_tier="free"
    )
    db.add(tenant)
    await db.flush()

    # Create TenantMember for Owner
    member = TenantMember(
        tenant_id=tenant.id,
        user_id=user.id,
        role="owner"
    )
    db.add(member)
    await db.flush()

    # Create Default Bot
    bot = Bot(
        tenant_id=tenant.id,
        name=f"{req.tenant_name} AI Assistant",
        greeting_message=f"Welcome to {req.tenant_name}! How can we assist you today?",
        theme_color="#4F46E5"
    )
    db.add(bot)
    await db.commit()

    token = create_access_token(subject=user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "tenant_id": tenant.id,
        "bot_id": bot.id
    }

@router.post("/login", response_model=TokenResponse)
async def login(req: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == req.username)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Fetch user tenant membership
    t_stmt = select(TenantMember).where(TenantMember.user_id == user.id)
    member = (await db.execute(t_stmt)).scalars().first()
    
    tenant_id = ""
    bot_id = ""
    if member:
        tenant_id = member.tenant_id
        b_stmt = select(Bot).where(Bot.tenant_id == tenant_id)
        bot = (await db.execute(b_stmt)).scalars().first()
        if bot:
            bot_id = bot.id

    token = create_access_token(subject=user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "tenant_id": tenant_id,
        "bot_id": bot_id
    }

@router.post("/supabase-login", response_model=TokenResponse)
async def supabase_login(req: SupabaseLoginRequest, db: AsyncSession = Depends(get_db)):
    from app.core.config import settings
    supabase_url = settings.SUPABASE_URL
    if not supabase_url:
        raise HTTPException(status_code=500, detail="SUPABASE_URL not configured")
    
    user_endpoint = f"{supabase_url}/auth/v1/user"
    async with httpx.AsyncClient() as client:
        resp = await client.get(user_endpoint, headers={
            "Authorization": f"Bearer {req.supabase_token}",
            "apikey": settings.SUPABASE_ANON_KEY
        })
        
    if resp.status_code != 200:
        print("Supabase Auth Error:", resp.status_code, resp.text)
        raise HTTPException(status_code=401, detail="Invalid Supabase token")
        
    data = resp.json()
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email found in Supabase token")
        
    stmt = select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    
    if req.is_signup and user:
        raise HTTPException(status_code=409, detail="Account already exists. Please log in instead.")
    
    if not user:
        full_name = data.get("user_metadata", {}).get("full_name", email.split("@")[0])
        user = User(
            email=email,
            hashed_password=get_password_hash("SUPABASE_AUTH_NO_PASSWORD"),
            full_name=full_name
        )
        db.add(user)
        await db.flush()

        tenant_name = f"{full_name}'s Workspace"
        tenant = Tenant(
            name=tenant_name,
            plan_tier="free"
        )
        db.add(tenant)
        await db.flush()

        member = TenantMember(
            tenant_id=tenant.id,
            user_id=user.id,
            role="owner"
        )
        db.add(member)
        await db.flush()

        bot = Bot(
            tenant_id=tenant.id,
            name=f"{tenant_name} AI",
            greeting_message=f"Welcome to {tenant_name}! How can I help?",
            theme_color="#4F46E5"
        )
        db.add(bot)
        await db.commit()
        
        tenant_id = tenant.id
        bot_id = bot.id
    else:
        t_stmt = select(TenantMember).where(TenantMember.user_id == user.id)
        member = (await db.execute(t_stmt)).scalars().first()
        
        tenant_id = ""
        bot_id = ""
        if member:
            tenant_id = member.tenant_id
            b_stmt = select(Bot).where(Bot.tenant_id == tenant_id)
            bot = (await db.execute(b_stmt)).scalars().first()
            if bot:
                bot_id = bot.id

    token = create_access_token(subject=user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "tenant_id": tenant_id,
        "bot_id": bot_id
    }
