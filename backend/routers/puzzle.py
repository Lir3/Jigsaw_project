# routers/puzzle.py
from fastapi import APIRouter, HTTPException
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
    session_data = {"user_id": req.user_id, "puzzle_id": req.puzzle_id, "elapsed_time": 0}
    res = supabase.table("single_sessions").insert(session_data).execute()
    if not res.data: raise HTTPException(status_code=500, detail="Failed to create session")
    return res.data[0]

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

    return {"status": "saved"}