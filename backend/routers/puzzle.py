# routers/puzzle.py
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List
from database import supabase

router = APIRouter()

# --- Pydantic データモデル ---
class PieceState(BaseModel):
    piece_index: int
    x: float
    y: float
    rotation: float
    is_locked: bool
    group_id: int

class SaveSessionRequest(BaseModel):
    user_id: str
    elapsed_time: int
    is_completed: bool
    pieces: List[PieceState]

class CreateSessionRequest(BaseModel):
    user_id: str
    puzzle_id: int
    difficulty: str = "normal"  # デフォルト値を設定

# --- API エンドポイント ---

@router.get("/masters")
def get_puzzle_masters():
    res = supabase.table("puzzle_masters").select("*").execute()
    return res.data

@router.get("/history/{user_id}")
def get_user_history(user_id: str):
    res = supabase.table("single_sessions")\
        .select("*, puzzle_masters(title, image_url)")\
        .eq("user_id", user_id)\
        .order("updated_at", desc=True)\
        .execute()
    return res.data

@router.post("/session")
def create_session(req: CreateSessionRequest):
    # 難易度も保存する
    session_data = {
        "user_id": req.user_id, 
        "puzzle_id": req.puzzle_id, 
        "difficulty": req.difficulty,
        "elapsed_time": 0
    }
    res = supabase.table("single_sessions").insert(session_data).execute()
    if not res.data: raise HTTPException(status_code=500, detail="Failed to create session")
    if not res.data: raise HTTPException(status_code=500, detail="Failed to create session")
    return res.data[0]

@router.get("/best")
def get_best_time(user_id: str, puzzle_id: int, difficulty: str):
    # 自己ベスト（最短時間）を取得
    res = supabase.table("single_sessions")\
        .select("elapsed_time")\
        .eq("user_id", user_id)\
        .eq("puzzle_id", puzzle_id)\
        .eq("difficulty", difficulty)\
        .eq("is_completed", True)\
        .order("elapsed_time", desc=False)\
        .limit(1)\
        .execute()
    
    if res.data and len(res.data) > 0:
        return {"best_time": res.data[0]["elapsed_time"]}
    if res.data and len(res.data) > 0:
        return {"best_time": res.data[0]["elapsed_time"]}
    else:
        return {"best_time": None}

@router.get("/best_times/{user_id}")
def get_user_best_times(user_id: str):
    # ユーザーの全完了データを取得して、パズル・難易度ごとのベストタイムを算出
    res = supabase.table("single_sessions")\
        .select("puzzle_id, difficulty, elapsed_time")\
        .eq("user_id", user_id)\
        .eq("is_completed", True)\
        .execute()
    
    bests = {}
    for item in res.data:
        # キーを一意にする (puzzle_id + difficulty)
        # default difficulty handling if needed
        diff = item.get('difficulty') or 'normal' 
        key = f"{item['puzzle_id']}_{diff}"
        
        time = item['elapsed_time']
        if key not in bests or time < bests[key]:
            bests[key] = time
            
    return bests

@router.get("/session/{session_id}")
def load_session(session_id: str):
    session_res = supabase.table("single_sessions")\
        .select("*, puzzle_masters(*)")\
        .eq("id", session_id).single().execute()
    if not session_res.data: raise HTTPException(status_code=404, detail="Session not found")
    
    pieces_res = supabase.table("single_session_pieces")\
        .select("*").eq("session_id", session_id).execute()
    
    return {"session": session_res.data, "pieces": pieces_res.data}

@router.post("/session/{session_id}/save")
def save_session(session_id: str, req: SaveSessionRequest):
    # 1. セッション情報の更新
    supabase.table("single_sessions").update({
        "elapsed_time": req.elapsed_time,
        "is_completed": req.is_completed,
        "updated_at": "now()"
    }).eq("id", session_id).execute()

    # 2. ピース情報の保存 (Upsert)
    if req.pieces:
        pieces_data = []
        for p in req.pieces:
            pieces_data.append({
                "session_id": session_id,
                "piece_index": p.piece_index,
                "x": p.x, "y": p.y, "rotation": p.rotation,
                "is_locked": p.is_locked, "group_id": p.group_id
            })
        supabase.table("single_session_pieces").upsert(pieces_data).execute()

    # 3. ベストタイム更新 (クリア時のみ)
    if req.is_completed:
        # セッションからパズルIDと難易度を取得
        current_session = supabase.table("single_sessions").select("puzzle_id, difficulty").eq("id", session_id).single().execute()
        if current_session.data:
            p_id = current_session.data['puzzle_id']
            diff = current_session.data['difficulty'] or 'normal'
            
            # 現在のベストを取得
            current_best_rec = supabase.table("user_best_records")\
                .select("elapsed_time")\
                .eq("user_id", req.user_id)\
                .eq("puzzle_id", p_id)\
                .eq("difficulty", diff)\
                .single().execute()
            
            should_update = False
            if not current_best_rec.data:
                should_update = True # レコードなし
            elif req.elapsed_time < current_best_rec.data['elapsed_time']:
                should_update = True # 新記録
            
            if should_update:
                supabase.table("user_best_records").upsert({
                    "user_id": req.user_id,
                    "puzzle_id": p_id,
                    "difficulty": diff,
                    "elapsed_time": req.elapsed_time,
                    "updated_at": "now()"
                }).execute()

    return {"status": "saved"}

@router.post("/upload")
async def upload_puzzle(user_id: str, file: UploadFile = File(...)):
    try:
        # 1. 保存パスの作成
        file_path = f"{user_id}/{file.filename}"
        file_content = await file.read()
        
        # 2. Storage へのアップロード
        supabase.storage.from_("puzzles").upload(
            path=file_path,
            file=file_content,
            file_options={"content-type": file.content_type, "x-upsert": "true"}
        )

        # 3. 公開URLの取得
        image_url = supabase.storage.from_("puzzles").get_public_url(file_path)
        
        # 4. puzzle_masters テーブルへ登録
        # get_public_url は文字列(URL)を返す仕様だが、念のためstr変換
        data = {
            "user_id": user_id,
            "image_url": str(image_url),
            "title": file.filename
        }
        
        db_res = supabase.table("puzzle_masters").insert(data).execute()
        
        return {"status": "success", "puzzle": db_res.data[0]}

    except Exception as e:
        # Supabase(PostgREST)からのエラーレスポンスを解析
        # エラーメッセージが辞書型か文字列かなどで判定
        error_msg = str(e)
        
        # 外部キー制約違反 (PostgreSQL Error Code 23503) を判定
        # details属性やmessage内にコードが含まれる場合がある
        if "23503" in error_msg or 'violates foreign key constraint "fk_user"' in error_msg:
             print(f"User ID mismatch: {user_id}")
             raise HTTPException(
                 status_code=401, 
                 detail="User not found. Please login again."
             )

        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{puzzle_id}")
async def delete_puzzle(puzzle_id: int):
    # 関連するセッションやピースはDBの CASCADE 設定で消えるようにします
    # ...が、DB側でCASCADE設定されていない場合のエラー回避のため、
    # 明示的に関連データを削除してからパズルマスターを削除します。
    
    # セッション削除 (関連するピースはCascadeまたは個別削除が必要だが、まずはセッション消去)
    supabase.table("single_sessions").delete().eq("puzzle_id", puzzle_id).execute()

    # まず画像URLを取得してStorageからも消す（任意）
    puzzle = supabase.table("puzzle_masters").select("image_url").eq("id", puzzle_id).single().execute()
    
    # DBから削除
    supabase.table("puzzle_masters").delete().eq("id", puzzle_id).execute()
    
    return {"status": "deleted"}

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    # セッション削除（関連するピースはCascade設定があれば消えるが、念のため確認）
    # Supabaseのテーブル定義で ON DELETE CASCADE になっていることを想定
    res = supabase.table("single_sessions").delete().eq("id", session_id).execute()
    
    if not res.data:
        # IDが見つからない場合など
        raise HTTPException(status_code=404, detail="Session not found or already deleted")
        
    return {"status": "deleted"}