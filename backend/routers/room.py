from fastapi import APIRouter, Form, HTTPException, Depends
from database import supabase
from routers.user import get_current_user
import uuid

router = APIRouter()

@router.post("/create")
def create_room(
    name: str = Form(...),
    max_players: int = Form(...),
    password: str = Form(None),
    current_user=Depends(get_current_user)
):
    room_id = str(uuid.uuid4())

    # rooms テーブルに登録
    data = {
        "id": room_id,
        "name": name,
        "host_user_id": current_user["id"],
        "max_players": max_players,
        "password": password
    }

    result = supabase.table("rooms").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="ルーム作成失敗")

    # 作成者を room_members に追加
    supabase.table("room_members").insert({
        "id": str(uuid.uuid4()),
        "room_id": room_id,
        "user_id": current_user["id"]
    }).execute()

    return {"message": "ルーム作成成功", "room_id": room_id}
