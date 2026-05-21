"""backend/routers/auth.py - 用户认证路由"""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User
from schemas import (
    LoginRequest,
    PasswordChangeRequest,
    Token,
    TokenRefreshRequest,
    UserCreate,
    UserResponse,
)
from slowapi import Limiter
from slowapi.util import get_remote_address

from services.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_token,
    get_current_user,
    get_password_hash,
    get_user_by_email,
    get_user_by_username,
    require_role,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Auth"])

limiter = Limiter(key_func=get_remote_address, default_limits=[])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Register a new user (analyst/guest only)")
@limiter.limit("5/minute")
def register(request: Request, user_data: UserCreate, db: Session = Depends(get_db)):
    """用户注册 — 自注册仅允许 analyst/guest 角色，admin 只能由现有管理员创建。"""
    # 检查用户名是否已存在
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )
    # 检查邮箱是否已存在
    if get_user_by_email(db, user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册",
        )
    # 自注册仅允许 analyst/guest，禁止选择 admin
    allowed_self_roles = ["analyst", "guest"]
    if user_data.role not in allowed_self_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"自注册仅允许角色: {allowed_self_roles}，admin 需由管理员创建",
        )

    user = create_user(db, user_data.username, user_data.email, user_data.password, user_data.role)
    logger.info(f"新用户注册: {user.username} ({user.role})")
    return user


@router.post("/admin/create-user", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Admin creates user with any role")
def admin_create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(require_role(["admin"])),
):
    """管理员创建用户 — 允许指定任意角色（含 admin）。"""
    valid_roles = ["admin", "analyst", "guest"]
    if user_data.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的角色，可选: {valid_roles}",
        )

    if get_user_by_username(db, user_data.username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")
    if get_user_by_email(db, user_data.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱已被注册")

    user = create_user(db, user_data.username, user_data.email, user_data.password, user_data.role)
    logger.info(f"管理员 {current_user.username} 创建用户: {user.username} ({user.role})")
    return user


@router.post("/login", response_model=Token, summary="Authenticate and get JWT tokens")
@limiter.limit("5/minute")
def login(request: Request, login_data: LoginRequest, db: Session = Depends(get_db)):
    """用户登录，返回 Access Token 和 Refresh Token"""
    user = authenticate_user(db, login_data.username, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )
    refresh_token = create_refresh_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )
    
    logger.info(f"用户登录: {user.username}")
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token, summary="Refresh access token")
@limiter.limit("10/minute")
def refresh_token(request: Request, token_data: TokenRefreshRequest, db: Session = Depends(get_db)):
    """刷新 Access Token"""
    payload = decode_token(token_data.refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Refresh Token",
        )
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的 Token 类型",
        )
    
    username = payload.get("sub")
    user = get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已禁用",
        )
    
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )
    new_refresh_token = create_refresh_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )
    
    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/me", response_model=UserResponse, summary="Logout (client-side token removal)")
def get_me(current_user: UserResponse = Depends(get_current_user)):
    """获取当前用户信息"""
    return current_user


@router.post("/logout", summary="Change current user password")
def logout(current_user: UserResponse = Depends(get_current_user)):
    """用户登出（客户端清除 Token 即可，服务端无需吊销）"""
    logger.info(f"用户登出: {current_user.username}")
    return {"message": "已登出"}


@router.post("/password/change", response_model=UserResponse, summary="Change current user password")
@limiter.limit("3/minute")
def change_password(
    request: Request,
    password_data: PasswordChangeRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """修改当前用户密码"""
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    
    if not verify_password(password_data.old_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误")
    
    user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    db.refresh(user)
    
    logger.info(f"用户修改密码: {user.username}")
    return user
