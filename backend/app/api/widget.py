from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_visitor_session_token
from app.models.models import AllowedDomain, Bot

router = APIRouter(prefix="/widget", tags=["Widget"])

class WidgetSessionRequest(BaseModel):
    public_key: str

class WidgetSessionResponse(BaseModel):
    visitor_session_token: str
    bot_name: str
    greeting_message: str
    theme_color: str
    primary_language: str

@router.post("/session", response_model=WidgetSessionResponse)
async def create_widget_session(
    req: WidgetSessionRequest,
    request: Request,
    origin: str = Header(default=None),
    db: AsyncSession = Depends(get_db)
):
    # Fetch bot by public key
    stmt = select(Bot).where(Bot.public_key == req.public_key, Bot.status == "active")
    bot = (await db.execute(stmt)).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found or inactive")

    ad_stmt = select(AllowedDomain).where(AllowedDomain.bot_id == bot.id)
    domains = (await db.execute(ad_stmt)).scalars().all()
    
    parsed_origin = urlparse(origin).netloc or origin if origin else ""
    domain_name = parsed_origin.split(":")[0] if parsed_origin else ""
    
    # Check if this is an authenticated dashboard user
    is_authenticated_admin = False
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            from jose import jwt
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = payload.get("sub")
            if user_id and user_id != "visitor":
                is_authenticated_admin = True
        except Exception:
            pass
    
    # Check if local development override applies
    is_localhost = domain_name.lower() in ["localhost", "127.0.0.1"]
    
    if is_authenticated_admin:
        pass # Always allow the simulator for dashboard users
    elif settings.DEVELOPMENT_MOCK_AI and is_localhost:
        pass # Allow localhost in dev
    else:
        if not origin:
            raise HTTPException(status_code=403, detail="Origin header missing")
            
        if not domains:
            raise HTTPException(status_code=403, detail="Bot has no allowed domains configured")
            
        allowed = [d.domain.lower() for d in domains]
        if domain_name.lower() not in allowed and origin.lower() not in allowed:
            raise HTTPException(status_code=403, detail="Domain not allowed")
    
    # Generate visitor token
    token = create_visitor_session_token(bot_id=bot.id, tenant_id=bot.tenant_id, origin=origin)
    
    return {
        "visitor_session_token": token,
        "bot_name": bot.name,
        "greeting_message": bot.greeting_message,
        "theme_color": bot.theme_color,
        "primary_language": bot.primary_language
    }
