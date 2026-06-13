import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.flow import Flow, FlowExecution, ExecutionStatus
# Resource access requires an *approved* account (pending/rejected → 403).
from app.auth.dependencies import get_approved_user as get_current_user

router = APIRouter(prefix="/flows", tags=["flows"])


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[dict] = None


class ExecuteRequest(BaseModel):
    input_data: Optional[dict] = {}


class PreviewRequest(BaseModel):
    definition: dict


@router.post("/preview")
async def preview_flow(data: PreviewRequest, user: User = Depends(get_current_user)):
    """Stateless in-memory run for live Auto-Run preview (no DB persistence)."""
    from app.engine.executor import FlowExecutor
    outputs = await FlowExecutor.run_preview(data.definition)
    return {"outputs": outputs}


@router.get("/{id}")
async def get_flow(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Flow).where(Flow.id == id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.patch("/{id}")
async def update_flow(id: str, data: FlowUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Flow).where(Flow.id == id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    if data.name is not None:
        flow.name = data.name
    if data.description is not None:
        flow.description = data.description
    if data.definition is not None:
        flow.definition = data.definition
    flow.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(flow)
    return flow


@router.delete("/{id}")
async def delete_flow(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Flow).where(Flow.id == id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    await db.delete(flow)
    await db.commit()
    return {"ok": True}


@router.post("/{id}/execute")
async def execute_flow(id: str, data: ExecuteRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Flow).where(Flow.id == id))
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    execution = FlowExecution(
        id=str(uuid.uuid4()),
        flow_id=id,
        triggered_by=user.id,
        status=ExecutionStatus.PENDING,
        input_data=data.input_data or {},
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Start execution in background (spawn_background keeps a strong reference —
    # a bare create_task can be garbage-collected mid-run and silently die)
    from app.engine.executor import FlowExecutor, spawn_background
    spawn_background(
        FlowExecutor.run(execution_id=execution.id, flow_definition=flow.definition)
    )

    return {"execution_id": execution.id}


@router.get("/{id}/executions")
async def list_executions(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(FlowExecution).where(FlowExecution.flow_id == id).order_by(FlowExecution.started_at.desc()).limit(20)
    )
    return result.scalars().all()
