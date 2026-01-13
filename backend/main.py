from fastapi.staticfiles import StaticFiles
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import supabase
from routers import puzzle, user, room


app = FastAPI()

# ベースパスとフロントエンドパスの設定
base_path = os.path.dirname(os.path.abspath(__file__))
# ★このパスは環境に合わせて確認してください
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
# フロントエンド内の /static ディレクトリを /static として公開
# 画像、CSS、JavaScriptファイルなどを提供
app.mount("/static", StaticFiles(directory=os.path.join(frontend_path)), name="static")

# --- ルーター登録 ---
# ピースの保存・取得などのロジックは routers/puzzle.py に集約されています
app.include_router(puzzle.router, prefix="/puzzle")
app.include_router(user.router, prefix="/user")
app.include_router(room.router, prefix="/room")

# ==========================================================
#  画面提供 (FileResponse)
# ==========================================================

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
    # シングルプレイ（進行度保存/再開）とマルチプレイの両方で使用される
    path = os.path.join(frontend_path, "play.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "play.html が存在しません"}, status_code=404)
    return FileResponse(path)

# 画像アップロード
@app.post("/puzzle/upload")
async def upload_puzzle(user_id: str, file: UploadFile = File(...)):
    # 1. Supabase Storage にアップロード
    file_path = f"{user_id}/{file.filename}"
    file_content = await file.read()
    
    # Storageに保存
    supabase.storage.from_("puzzles").upload(file_path, file_content, {"content-type": file.content_type})
    
    # 公開URLを取得
    image_url = supabase.storage.from_("puzzles").get_public_url(file_path)

    # 2. puzzle_masters テーブルに情報を登録
    data = {
        "user_id": user_id,
        "image_url": image_url,
        "title": file.filename
    }
    result = supabase.table("puzzle_masters").insert(data).execute()
    
    return {"status": "success", "puzzle": result.data[0]}

# パズル削除
@app.delete("/puzzle/{puzzle_id}")
async def delete_puzzle(puzzle_id: int):
    # 関連するセッションやピースはDBの CASCADE 設定で消えるようにします
    # まず画像URLを取得してStorageからも消す（任意）
    puzzle = supabase.table("puzzle_masters").select("image_url").eq("id", puzzle_id).single().execute()
    
    # DBから削除
    supabase.table("puzzle_masters").delete().eq("id", puzzle_id).execute()
    
    return {"status": "deleted"}

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

# 🚀 【新規追加】シングルプレイ：ギャラリー画面
@app.get("/single/gallery")
def serve_single_gallery():
    path = os.path.join(frontend_path, "single_gallery.html")
    if not os.path.exists(path):
        # single_gallery.html が存在しない場合、エラーを返す
        return JSONResponse(content={"error": "single_gallery.html が存在しません。Step 4のファイル作成を確認してください。"}, status_code=404)
    return FileResponse(path)

# --- ルーム関連 ---
@app.get("/room/create")
def serve_room_create():
    path = os.path.join(frontend_path, "room_create.html")
    return FileResponse(path)

@app.get("/room/join")
def serve_room_join():
    path = os.path.join(frontend_path, "room_join.html")
    return FileResponse(path)

# --- ルーム一覧ページ ---
@app.get("/room/list")
def serve_room_list():
    path = os.path.join(frontend_path, "room_list.html")
    if not os.path.exists(path):
        return JSONResponse(content={"error": "room_list.html が存在しません"}, status_code=404)
    return FileResponse(path)

# ルーム一覧ページ
@app.get("/room/list-page")
def serve_room_list():
    path = os.path.join(frontend_path, "room_list.html")
    return FileResponse(path)

#接続テストページ
@app.get("/room/wait")
def serve_room_wait():
    path = os.path.join(frontend_path, "room_wait.html")
    return FileResponse(path)

