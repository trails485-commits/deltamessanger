from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from typing import Dict, List

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)

    async def broadcast(self, message: str, room_id: str):
        for connection in self.active_connections.get(room_id, []):
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/chat/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    await manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"{user_id}: {data}", room_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        await manager.broadcast(f"👋 {user_id} покинул чат", room_id)

app.mount("/", StaticFiles(directory="static", html=True), name="static")