import os
import uuid
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from database import supabase

app = FastAPI()

# frontend 静的ファイルの配置ディレクトリ
base_path = os.path.dirname(os.path.abspath(__file__))
frontend_path = os.path.join(base_path, "../frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")


@app.get("/")
def serve_upload_html():
    """アップロード用 HTML を返す"""
    upload_file_path = os.path.join(frontend_path, "upload.html")
    if not os.path.exists(upload_file_path):
        return JSONResponse(content={"error": "upload.html が存在しません"}, status_code=404)
    return FileResponse(upload_file_path)


@app.post("/upload-puzzle")
async def upload_puzzle(
    title: str = Form(...),
    difficulty: int = Form(1),
    file: UploadFile = File(...)
):
    try:
        contents = await file.read()
        # 空白や日本語を避け UUID に置換
        ext = file.filename.split('.')[-1]
        filename = f"{uuid.uuid4()}.{ext}"
        path = f"user_uploads/{filename}"

        # Supabase Storage にアップロード
        supabase.storage.from_("puzzle-images").upload(path, contents)

        # 公開 URL 取得
        public_url = supabase.storage.from_("puzzle-images").get_public_url(path)

        # DB 登録
        supabase.table("puzzles").insert({
            "title": title,
            "image_url": public_url,
            "difficulty": difficulty
        }).execute()

        return {"message": "アップロード成功", "url": public_url}

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
