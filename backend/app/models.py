from datetime import datetime, date
from sqlalchemy import (
    Integer, String, Text, Boolean, Date, DateTime,
    ForeignKey, Index, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    upload_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    doc_type: Mapped[str | None] = mapped_column(String)  # meeting_notes|email|plan|raid|other
    content_text: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String)

    actions: Mapped[list["Action"]] = relationship("Action", back_populates="source_doc")
    deadlines: Mapped[list["Deadline"]] = relationship("Deadline", back_populates="source_doc")


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str | None] = mapped_column(String)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String, default="open")  # open|in_progress|done|blocked
    priority: Mapped[str | None] = mapped_column(String)  # high|medium|low
    created_from_doc_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("documents.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    source_doc: Mapped["Document | None"] = relationship("Document", back_populates="actions")

    __table_args__ = (
        Index("idx_actions_due_date", "due_date"),
        Index("idx_actions_status", "status"),
    )


class Risk(Base):
    __tablename__ = "risks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    impact: Mapped[str | None] = mapped_column(String)      # high|medium|low
    likelihood: Mapped[str | None] = mapped_column(String)  # high|medium|low
    mitigation: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="open")  # open|mitigated|accepted|closed
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Dependency(Base):
    __tablename__ = "dependencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_a: Mapped[str] = mapped_column(Text, nullable=False)
    task_b: Mapped[str] = mapped_column(Text, nullable=False)
    dependency_type: Mapped[str | None] = mapped_column(String)  # blocks|enables|relates_to
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Deadline(Base):
    __tablename__ = "deadlines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    deadline_date: Mapped[date] = mapped_column(Date, nullable=False)
    met: Mapped[bool] = mapped_column(Boolean, default=False)
    source_doc_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("documents.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    source_doc: Mapped["Document | None"] = relationship("Document", back_populates="deadlines")

    __table_args__ = (Index("idx_deadlines_date", "deadline_date"),)


class ScopeItem(Base):
    __tablename__ = "scope_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    added_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    source: Mapped[str | None] = mapped_column(String)  # original_plan|change_request|meeting
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    impact_assessment: Mapped[str | None] = mapped_column(Text)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String, nullable=False)  # deadline|action|scope_change|risk
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    severity: Mapped[str | None] = mapped_column(String)  # urgent|warning|info
    related_id: Mapped[int | None] = mapped_column(Integer)
    related_type: Mapped[str | None] = mapped_column(String)  # action|risk|deadline|scope_item

    __table_args__ = (Index("idx_notifications_read", "read"),)
