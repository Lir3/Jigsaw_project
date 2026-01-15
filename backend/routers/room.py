from fastapi import APIRouter, Form, HTTPException, Depends, UploadFile, File
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

@router.get("/list")
def get_rooms():
    rooms_result = supabase.table("rooms").select(
        "id, name, max_players, password"
    ).execute()

    if not rooms_result.data:
        return {"rooms": []}

    rooms = []

    for room in rooms_result.data:
        # 参加人数を数える
        members_result = supabase.table("room_members") \
            .select("id", count="exact") \
            .eq("room_id", room["id"]) \
            .execute()

        current_players = members_result.count or 0

        rooms.append({
            "id": room["id"],
            "name": room["name"],
            "max_players": room["max_players"],
            "current_players": current_players,
            "has_password": bool(room["password"])
        })

    return {"rooms": rooms}


@router.post("/join")
def join_room(
    room_id: str = Form(...),
    current_user=Depends(get_current_user)
):
    # すでに参加しているか確認
    exists = supabase.table("room_members") \
        .select("id") \
        .eq("room_id", room_id) \
        .eq("user_id", current_user["id"]) \
        .execute()

    if exists.data:
        return {"message": "すでに参加しています"}

    # 参加登録
    supabase.table("room_members").insert({
        "id": str(uuid.uuid4()),
        "room_id": room_id,
        "user_id": current_user["id"]
    }).execute()

    return {"message": "ルーム参加成功"}

@router.get("/wait/info")
def get_room_wait_info(room_id: str):
    room = supabase.table("rooms") \
        .select("id, name") \
        .eq("id", room_id) \
        .single() \
        .execute()

    if not room.data:
        raise HTTPException(status_code=404, detail="ルームが存在しません")

    members = supabase.table("room_members") \
        .select("user_id") \
        .eq("room_id", room_id) \
        .execute()

    return {
        "room": room.data,
        "members": members.data
    }


@router.post("/upload")
async def upload_room_image(file: UploadFile = File(...)):
    # 保存先ディレクトリ (frontend/static/uploads)
    # ※ 本来は main.py の frontend_path を参照したいが、簡易的に相対パス算出
    import os
    import shutil
    
    # backend/routers/room.py -> backend/routers -> backend -> jigsaw_project -> frontend
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    upload_dir = os.path.join(base_dir, "frontend", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    # ファイル名 (衝突防止のためUUID付与推奨だが、今回は簡易実装)
    file_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(upload_dir, file_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # URLを返す
    return {"url": f"/static/uploads/{file_name}"}
