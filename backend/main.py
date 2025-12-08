from fastapi.staticfiles import StaticFiles
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from routers import puzzle, user, room


app = FastAPI()

base_path = os.path.dirname(os.path.abspath(__file__))
frontend_path = os.path.abspath(os.path.join(base_path, "../frontend"))

# --- CORS設定 ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 静的ファイルの提供 ---
app.mount("/static", StaticFiles(directory=os.path.join(frontend_path)), name="static")

# --- ルーター登録 ---
app.include_router(puzzle.router, prefix="/puzzle")
app.include_router(user.router, prefix="/user")
app.include_router(room.router, prefix="/room")

# --- ホーム画面 (index.html) ---
@app.get("/")
def serve_index_html():
    path = os.path.join(frontend_path, "index.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "index.html が存在しません"}, status_code=404)
    return FileResponse(path)

# --- アップロード画面 ---
@app.get("/upload")
def serve_upload_html():
    path = os.path.join(frontend_path, "upload.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "upload.html が存在しません"}, status_code=404)
    return FileResponse(path)

# --- パズルプレイ画面 ---
@app.get("/play")
def serve_play_html():
    path = os.path.join(frontend_path, "play.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "play.html が存在しません"}, status_code=404)
    return FileResponse(path)

# --- ログイン画面 ---
@app.get("/user/login")
def serve_login_html():
    path = os.path.join(frontend_path, "login.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "login.html が存在しません"}, status_code=404)
    return FileResponse(path)

# --- 新規登録画面 ---
@app.get("/user/signup")
def serve_signup_html():
    path = os.path.join(frontend_path, "signup.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "signup.html が存在しません"}, status_code=404)
    return FileResponse(path)

# ログイン後 モード選択画面
@app.get("/mode")
def serve_mode_select():
    path = os.path.join(frontend_path, "mode_select.html")
    return FileResponse(path)

# ルーム作成ページ
@app.get("/room/create")
def serve_room_create():
    path = os.path.join(frontend_path, "room_create.html")
    return FileResponse(path)

# ルーム参加ページ
@app.get("/room/join")
def serve_room_join():
    path = os.path.join(frontend_path, "room_join.html")
    return FileResponse(path)
#待機部屋（仮）
@app.get("/room/wait")
def wait_room(room_id: str):
    return {"message": f"Room {room_id} waiting..."}
