# routers/user.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def read_user():
    return {"message": "User router is working"}
