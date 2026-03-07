"""Request ID middleware — generates a unique ID per request for tracing."""
import uuid

from fastapi import Request
from fastapi.responses import Response


async def request_id_middleware(request: Request, call_next) -> Response:
    """Attach a unique request ID to every request and echo it in the response."""
    # Honor incoming X-Request-ID if present (e.g. from reverse proxy)
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = req_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response
