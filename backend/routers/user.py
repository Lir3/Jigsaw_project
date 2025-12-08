# routers/user.py
from fastapi import APIRouter, Form, HTTPException
from passlib.context import CryptContext
from database import supabase
import uuid

router = APIRouter()

# パスワードハッシュ用（bcryptを使用）
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ✅ パスワードをハッシュ化
def get_password_hash(password: str):

    # 🔒 bcryptの72byte制限チェック
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="パスワードは72バイト以内で入力してください"
        )

    return pwd_context.hash(password)


# ✅ パスワード検証
def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)


# ✅ ユーザー登録（サインアップ）
@router.post("/signup")
async def signup(username: str = Form(...), password: str = Form(...)):
    # すでに同じユーザー名が存在しないかチェック
    existing = supabase.table("users").select("*").eq("username", username).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="このユーザー名は既に使われています")

    # 🔐 ハッシュ化
    password_hash = get_password_hash(password)
    user_id = str(uuid.uuid4())

    supabase.table("users").insert({
        "id": user_id,
        "username": username,
        "password_hash": password_hash
    }).execute()

    return {"message": "ユーザー登録成功", "username": username}


# ✅ ログイン（サインイン）
@router.post("/login")
async def login(username: str = Form(...), password: str = Form(...)):
    result = supabase.table("users").select("*").eq("username", username).execute()

    if not result.data:
        raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")

    user = result.data[0]
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")

    return {"message": "ログイン成功", "user_id": user["id"], "username": user["username"]}


@router.get("/")
def read_user():
    return {"message": "User router is working"}

from fastapi import Header, HTTPException

def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="未ログイン")

    # 仮のユーザー（あとでJWTやSupabase認証に変える）
    return {
        "id": authorization,
        "username": "test_user"
    }

