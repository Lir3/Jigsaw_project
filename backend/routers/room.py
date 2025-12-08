from fastapi import APIRouter, Form, HTTPException
import uuid

router = APIRouter()

rooms = {}  # 簡易DB（あとでSupabaseなどに）

@router.post("/create")
def create_room(
    room_name: str = Form(...),
    password: str = Form(None),
    max_players: int = Form(...),
    owner_id: str = Form(...)
):
    room_id = str(uuid.uuid4())

    rooms[room_id] = {
        "room_id": room_id,
        "room_name": room_name,
        "password": password,
        "max_players": max_players,
        "players": [owner_id]
    }

    return {"room_id": room_id}
