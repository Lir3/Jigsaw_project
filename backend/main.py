import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from routers import puzzle, user

app = FastAPI()

base_path = os.path.dirname(os.path.abspath(__file__))
frontend_path = os.path.abspath(os.path.join(base_path, "../frontend"))

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(puzzle.router, prefix="/puzzle")
app.include_router(user.router, prefix="/user") # 追加

@app.get("/")
def serve_upload_html():
    path = os.path.join(frontend_path, "upload.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "upload.html が存在しません"}, status_code=404)
    return FileResponse(path)

@app.get("/play")
def serve_play_html():
    path = os.path.join(frontend_path, "play.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "play.html が存在しません"}, status_code=404)
    return FileResponse(path)

@app.get("/user/login")
def serve_login_html():
    path = os.path.join(frontend_path, "login.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "login.html が存在しません"}, status_code=404)
    return FileResponse(path)

@app.get("/user/signup")
def serve_signup_html():
    path = os.path.join(frontend_path, "signup.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "signup.html が存在しません"}, status_code=404)
    return FileResponse(path)

