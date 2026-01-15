from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import List, Dict, Any
import json
import asyncio

router = APIRouter()

# --- Managers ---

class ConnectionManager:
    def __init__(self):
        # room_id -> List[WebSocket]
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # room_id -> { user_id: { "username": str, "joined_at": str } } (簡易的なメンバー管理)
        # 実際にはDBから取得するが、WebSocket接続中のユーザーを把握するために保持
        self.room_members: Dict[str, Dict[str, Any]] = {}

    async def connect(self, room_id: str, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
            self.room_members[room_id] = {}
        
        self.active_connections[room_id].append(websocket)
        # メンバー追加は別途 JOIN メッセージで行うか、ここでDB参照してもよいが、
        # 簡易的にWebSocket接続=参加中とみなす
        print(f"User {user_id} connected to room {room_id}")

    def disconnect(self, room_id: str, websocket: WebSocket, user_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            
            # 全員いなくなったら部屋の状態を消す？ -> オンメモリなら消すべき
            if not self.active_connections[room_id]:
                # del self.active_connections[room_id]
                # GameStateも消すべきだが、一時的な切断の可能性もあるので要検討
                pass

    async def broadcast(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            # 切断されたソケットへの送信エラーを防ぐためコピーして回すなどの対策が必要だが
            # WebSocketDisconnectで処理されるので基本はOK
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    print(f"Broadcast error: {e}")

    def get_member_count(self, room_id: str):
        return len(self.active_connections.get(room_id, []))


class GameStateManager:
    def __init__(self):
        # room_id -> { piece_index: { x, y, rotation, group, locked_by } }
        self.game_states: Dict[str, Dict[int, Any]] = {}
        # room_id -> is_started (bool)
        self.room_status: Dict[str, bool] = {}
        # room_id -> image_url
        self.room_images: Dict[str, str] = {}
        # room_id -> start_timestamp (タイマー同期用)
        self.room_start_times: Dict[str, int] = {}
        # room_id -> host_user_id (ホスト管理用)
        self.room_hosts: Dict[str, str] = {}

    def init_room(self, room_id: str, host_user_id: str = None):
        if room_id not in self.game_states:
            self.game_states[room_id] = {} # ピース情報はSTART時に埋める
            self.room_status[room_id] = False
        
        # ホストIDは初回のみ設定（既に設定されていれば上書きしない）
        if host_user_id and room_id not in self.room_hosts:
            self.room_hosts[room_id] = host_user_id

    def set_image(self, room_id: str, image_url: str):
        self.room_images[room_id] = image_url

    def get_image(self, room_id: str):
        return self.room_images.get(room_id)


    def start_game(self, room_id: str, initial_pieces: List[dict], start_time: int):
        self.game_states[room_id] = {
            p["index"]: {
                "x": p["x"],
                "y": p["y"],
                "rotation": p["rotation"],
                "group": [p["index"]], # 初期は自分のみ
                "locked_by": None
            } for p in initial_pieces
        }
        self.room_status[room_id] = True
        self.room_start_times[room_id] = start_time

    def get_all_pieces(self, room_id: str):
        state = self.game_states.get(room_id, {})
        # Dict -> List[{index, ...}]
        pieces_list = []
        for idx in sorted(state.keys()): # インデックス順にしておくと無難
            p = state[idx]
            pieces_list.append({
                "index": idx,
                "x": p["x"],
                "y": p["y"],
                "rotation": p["rotation"]
            })
        return pieces_list

    def get_piece(self, room_id: str, index: int):
        return self.game_states.get(room_id, {}).get(index)
    
    def get_start_time(self, room_id: str):
        """ゲーム開始時刻を取得"""
        return self.room_start_times.get(room_id)
    
    def get_host(self, room_id: str):
        """ルームのホストユーザーIDを取得"""
        return self.room_hosts.get(room_id)
    
    def cleanup_room(self, room_id: str):
        """ルームの全データを削除"""
        self.game_states.pop(room_id, None)
        self.room_status.pop(room_id, None)
        self.room_images.pop(room_id, None)
        self.room_start_times.pop(room_id, None)
        self.room_hosts.pop(room_id, None)

    def lock_piece(self, room_id: str, index: int, user_id: str) -> bool:
        """ピースをロックする（排他制御）。成功ならTrue"""
        state = self.game_states.get(room_id, {})
        piece = state.get(index)
        if not piece: return False
        
        # すでに誰かにロックされていたら失敗 (自分自身ならOK?)
        if piece["locked_by"] and piece["locked_by"] != user_id:
            return False
            
        piece["locked_by"] = user_id
        
        # グループ全体もロックすべき？ -> フロントエンドの挙動に合わせる
        # ここでは「親」だけでなくグループメンバー全員をロック扱いにすると安全
        for member_idx in piece["group"]:
             state[member_idx]["locked_by"] = user_id
             
        return True

    def unlock_piece(self, room_id: str, index: int, user_id: str):
        state = self.game_states.get(room_id, {})
        piece = state.get(index)
        if piece and piece["locked_by"] == user_id:
            piece["locked_by"] = None
            # グループ解除
            for member_idx in piece["group"]:
                if state[member_idx]["locked_by"] == user_id:
                    state[member_idx]["locked_by"] = None

    def update_piece(self, room_id: str, index: int, x: float, y: float, rotation: int, user_id: str):
        state = self.game_states.get(room_id, {})
        piece = state.get(index)
        if piece and piece["locked_by"] == user_id:
            piece["x"] = x
            piece["y"] = y
            piece["rotation"] = rotation
    
    def merge_groups(self, room_id: str, piece1_idx: int, piece2_idx: int):
        """2つのピース（のグループ）を結合する"""
        state = self.game_states.get(room_id, {})
        p1 = state.get(piece1_idx)
        p2 = state.get(piece2_idx)
        if not p1 or not p2: return
        
        # p2のグループをp1のグループに統合
        new_group = list(set(p1["group"] + p2["group"]))
        
        for idx in new_group:
            state[idx]["group"] = new_group

manager = ConnectionManager()
game_state = GameStateManager()

# --- WebSocket Endpoint ---

@router.websocket("/ws/puzzle/{room_id}/{user_id}")
async def puzzle_websocket(websocket: WebSocket, room_id: str, user_id: str):
    await manager.connect(room_id, websocket, user_id)
    
    # DBからルーム情報を取得してホストを特定
    from .room import supabase
    try:
        room_data = supabase.table("rooms").select("host_user_id").eq("id", room_id).single().execute()
        creator_id = room_data.data.get("host_user_id") if room_data.data else None
        game_state.init_room(room_id, creator_id)  # DBのホストを使用
    except Exception as e:
        print(f"Error fetching room creator: {e}")
        game_state.init_room(room_id, user_id)  # フォールバック
    
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            msg_type = payload.get("type")
            
            if msg_type == "JOIN":
                # ホストかどうかを通知
                is_host = (game_state.get_host(room_id) == user_id)
                await websocket.send_text(json.dumps({
                    "type": "IS_HOST",
                    "is_host": is_host
                }))
                
                # 他のメンバーに通知
                count = manager.get_member_count(room_id)
                await manager.broadcast(room_id, {
                    "type": "PLAYER_JOINED", 
                    "user_id": user_id,
                    "count": count
                })
                
                # 現在の状態を送信（再接続時など）
                # wait state or playing state
                if game_state.room_status.get(room_id):
                    # ゲーム中なら現在のピース情報を送る
                    current_pieces = game_state.get_all_pieces(room_id)
                    start_time = game_state.get_start_time(room_id)
                    await websocket.send_text(json.dumps({
                        "type": "GAME_STARTED", # 途中参加でも STARTED と同じ扱いでOK
                        "pieces": current_pieces,
                        "start_time": start_time  # タイマー同期用
                    }))
                
                # 画像が決まっていれば送る
                current_image = game_state.get_image(room_id)
                if current_image:
                    await websocket.send_text(json.dumps({
                        "type": "IMAGE_SET",
                        "image_url": current_image
                    }))

            elif msg_type == "SET_IMAGE":
                url = payload.get("image_url")
                # 既に同じ画像が設定済みなら無視（重複送信防止）
                if game_state.get_image(room_id) == url:
                    print(f"Image already set for room {room_id}, skipping broadcast")
                    continue
                    
                game_state.set_image(room_id, url)
                await manager.broadcast(room_id, {
                    "type": "IMAGE_SET", 
                    "image_url": url
                })

            elif msg_type == "START_GAME":
                # ホストのみ実行可能等のチェックが必要だが、一旦スルー
                # 初期配置（シャッフル済）を受け取るか、サーバーで生成するか
                # クライアント(Host)が生成して送ってくるパターンで実装してみる
                initial_pieces = payload.get("pieces") # List[{index, x, y, rotation}]
                
                # ゲーム開始時刻を記録（タイマー同期用）
                import time
                start_timestamp = int(time.time())
                
                game_state.start_game(room_id, initial_pieces, start_timestamp)
                
                await manager.broadcast(room_id, {
                    "type": "GAME_STARTED",
                    "pieces": initial_pieces,
                    "start_time": start_timestamp  # タイマー同期用
                })

            elif msg_type == "GRAB":
                idx = payload.get("index")
                if game_state.lock_piece(room_id, idx, user_id):
                    await manager.broadcast(room_id, {
                        "type": "LOCKED",
                        "index": idx,
                        "user_id": user_id
                    })
                else:
                    # ロック失敗（他人が持ってる）
                    # 必要ならエラー通知
                    pass

            elif msg_type == "MOVE":
                # 位置更新
                idx = payload.get("index")
                x = payload.get("x")
                y = payload.get("y")
                rotation = payload.get("rotation")
                
                game_state.update_piece(room_id, idx, x, y, rotation, user_id)
                
                # *自分以外* にブロードキャストしたいが、broadcastメソッドは全員に送る
                # クライアント側で「自分のIDのメッセージは無視」するか、
                # broadcastメソッドを改造して exclude_socket を受け取れるようにするか。
                # ここでは全員に送り、クライアントでフィルタリングする。
                await manager.broadcast(room_id, {
                    "type": "MOVED",
                    "index": idx,
                    "x": x,
                    "y": y,
                    "rotation": rotation,
                    "user_id": user_id
                })

            elif msg_type == "RELEASE":
                idx = payload.get("index")
                x = payload.get("x")
                y = payload.get("y")
                rotation = payload.get("rotation")
                
                # 最終位置更新してからアンロック
                game_state.update_piece(room_id, idx, x, y, rotation, user_id)
                game_state.unlock_piece(room_id, idx, user_id)
                
                await manager.broadcast(room_id, {
                    "type": "UNLOCKED",
                    "index": idx,
                    "x": x,
                    "y": y,
                    "rotation": rotation
                })

            elif msg_type == "MERGE":
                # 結合イベント
                p1 = payload.get("piece1_index")
                p2 = payload.get("piece2_index")
                
                game_state.merge_groups(room_id, p1, p2)
                
                await manager.broadcast(room_id, {
                    "type": "MERGED",
                    "piece1_index": p1,
                    "piece2_index": p2
                })
                
            elif msg_type == "CHAT":
                # チャットメッセージ
                message_text = payload.get("message", "").strip()
                
                # メッセージ長チェック
                if not message_text or len(message_text) > 200:
                    continue
                
                # ユーザー名を取得
                from .user import supabase
                try:
                    user_data = supabase.table("users").select("username").eq("id", user_id).single().execute()
                    username = user_data.data.get("username") if user_data.data else user_id[:8]
                except:
                    username = user_id[:8]  # フォールバック
                
                import time
                timestamp = int(time.time() * 1000)  # ミリ秒
                
                # ルーム全体にブロードキャスト
                await manager.broadcast(room_id, {
                    "type": "CHAT",
                    "user_id": user_id,
                    "username": username,
                    "message": message_text,
                    "timestamp": timestamp
                })
                
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket, user_id)
        
        # ホストが退出した場合、ルームを即座に閉じる
        is_host = (game_state.get_host(room_id) == user_id)
        
        if is_host:
            print(f"Host {user_id} disconnected. Closing room {room_id}...")
            # 全員に通知して切断を促す
            await manager.broadcast(room_id, {
                "type": "ROOM_CLOSED",
                "message": "ホストが退出したためルームが解散されました"
            })
            
            # データベースから削除
            try:
                from .room import supabase
                supabase.table("rooms").delete().eq("id", room_id).execute()
            except Exception as e:
                print(f"Error deleting room from DB: {e}")

            # メモリ上のルームデータを削除
            game_state.cleanup_room(room_id)
            
            # 残っている接続を強制切断する処理があればここで実行したいが、
            # ConnectionManager側で管理しているなら、broadcast後に接続を切る等の処理が必要かも。
            # 今回はクライアント側で ROOM_CLOSED を受け取ったら退出するように実装済み。
            
        else:
            # 通常の退出（ゲスト）
            count = manager.get_member_count(room_id)
            await manager.broadcast(room_id, {
                "type": "PLAYER_LEFT", 
                "user_id": user_id,
                "count": count
            })
