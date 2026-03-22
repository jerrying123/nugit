"""WebSocket for stack events to extensions."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from stackpr.ws_manager import ConnectionManager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket upgrade — stack events. Use app.state.ws_manager to broadcast."""
    app = websocket.scope.get("app")
    if not app:
        await websocket.close(code=1011)
        return
    manager: ConnectionManager = app.state.ws_manager
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"echo": data})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
