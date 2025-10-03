from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse, RedirectResponse
import uuid
from database import supabase

router = APIRouter()

@router.post("/upload-puzzle")
async def upload_puzzle(
    title: str = Form(...),
    difficulty: int = Form(1),
    file: UploadFile = File(...)
):
    try:
        contents = await file.read()
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

        return {"message": "アップロード成功", "url": public_url, "difficulty": difficulty}
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=500)
