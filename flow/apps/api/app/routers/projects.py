import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.project import Project
# Resource access requires an *approved* account (pending/rejected → 403).
from app.auth.dependencies import get_approved_user as get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class FlowCreate(BaseModel):
    name: str
    description: Optional[str] = ""


@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Project).where(Project.owner_id == user.id).order_by(Project.created_at.desc()))
    return result.scalars().all()


@router.post("")
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="ต้องระบุชื่อโปรเจกต์")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="ชื่อโปรเจกต์ยาวเกิน 100 ตัวอักษร")
    project = Project(id=str(uuid.uuid4()), owner_id=user.id, name=name, description=data.description or "")
    db.add(project)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="บันทึกโปรเจกต์ไม่สำเร็จ (ข้อมูลชนกัน) — ลองอีกครั้ง")
    await db.refresh(project)
    return project


@router.get("/{id}")
async def get_project(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Project).where(Project.id == id, Project.owner_id == user.id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{id}")
async def update_project(id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Project).where(Project.id == id, Project.owner_id == user.id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{id}")
async def delete_project(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Project).where(Project.id == id, Project.owner_id == user.id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
    return {"ok": True}


@router.get("/{id}/flows")
async def list_flows(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.flow import Flow
    result = await db.execute(select(Flow).where(Flow.project_id == id).order_by(Flow.updated_at.desc()))
    return result.scalars().all()


@router.post("/{id}/flows")
async def create_flow(id: str, data: FlowCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.flow import Flow
    flow = Flow(id=str(uuid.uuid4()), project_id=id, name=data.name, description=data.description or "")
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return flow
