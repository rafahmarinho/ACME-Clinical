"""Pydantic models for request bodies (validated before reaching the services)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Role = Literal["nurse", "physician", "biomed", "admin"]
Parameter = Literal["hr", "spo2", "rr", "sys", "dia"]
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Preferences(Strict):
    alarm_sound: bool | None = None
    auto_advance: bool | None = None
    default_ward: str | None = None
    density: Literal["comfortable", "compact"] | None = None
    temperature_unit: Literal["C", "F"] | None = None
    show_waveforms: bool | None = None
    notify_critical: bool | None = None


class ProfileUpdate(Strict):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    preferences: Preferences | None = None


class PatientUpdate(Strict):
    diagnosis: str | None = Field(default=None, min_length=2, max_length=300)
    acuity: int | None = Field(default=None, ge=1, le=5)
    code_status: str | None = Field(default=None, max_length=60)
    isolation: str | None = Field(default=None, max_length=60)
    allergies: list[str] | None = None
    attending_id: str | None = None


class NoteCreate(Strict):
    category: Literal["general", "assessment", "medication", "handoff", "alarm"] = "general"
    body: str = Field(min_length=2, max_length=4000)


class ThresholdIn(Strict):
    parameter: Parameter
    warn_low: float | None = Field(default=None, ge=0, le=300)
    warn_high: float | None = Field(default=None, ge=0, le=300)
    crit_low: float | None = Field(default=None, ge=0, le=300)
    crit_high: float | None = Field(default=None, ge=0, le=300)
    enabled: bool = True


class ThresholdList(Strict):
    thresholds: list[ThresholdIn] = Field(min_length=1, max_length=5)


class AcknowledgeIn(Strict):
    note: str | None = Field(default=None, max_length=500)


class AssignIn(Strict):
    bed_id: str


class MaintenanceModeIn(Strict):
    enabled: bool


MaintenanceKind = Literal["preventive", "repair", "battery_replacement", "calibration", "inspection"]
MaintenanceStatus = Literal["scheduled", "in_progress", "completed", "cancelled"]


class MaintenanceCreate(Strict):
    monitor_id: str
    kind: MaintenanceKind
    title: str = Field(min_length=3, max_length=200)
    details: str | None = Field(default=None, max_length=2000)
    scheduled_for: date | None = None
    status: MaintenanceStatus = "scheduled"
    technician_id: str | None = None

    def to_row(self) -> dict:
        data = self.model_dump()
        data["scheduled_for"] = self.scheduled_for.isoformat() if self.scheduled_for else None
        return data


class MaintenanceUpdate(Strict):
    status: MaintenanceStatus | None = None
    resolution: str | None = Field(default=None, max_length=2000)
    details: str | None = Field(default=None, max_length=2000)
    scheduled_for: date | None = None
    technician_id: str | None = None

    def to_row(self) -> dict:
        data = self.model_dump(exclude_unset=True)
        if "scheduled_for" in data and data["scheduled_for"] is not None:
            data["scheduled_for"] = data["scheduled_for"].isoformat()
        return data


class ReportCreate(Strict):
    kind: Literal["shift_summary", "patient_summary", "device_status", "alarm_log"]
    format: Literal["pdf", "csv"] = "pdf"
    hours: float = Field(default=8, ge=0.5, le=48)
    patient_id: str | None = None
    ward_id: str | None = None


class ReportEmail(Strict):
    recipient: str = Field(pattern=EMAIL_PATTERN, max_length=200)


class TeamInvite(Strict):
    email: str = Field(pattern=EMAIL_PATTERN, max_length=200)
    full_name: str = Field(min_length=2, max_length=120)
    role: Role
    title: str | None = Field(default=None, max_length=120)


class TeamUpdate(Strict):
    role: Role | None = None
    is_active: bool | None = None
    title: str | None = Field(default=None, max_length=120)


class Integrations(Strict):
    pager: bool = True
    email: bool = True
    ehr: bool = True


class SystemSettingsUpdate(Strict):
    hospital_name: str | None = Field(default=None, min_length=2, max_length=120)
    escalation_minutes: int | None = Field(default=None, ge=1, le=60)
    ehr_sync_minutes: int | None = Field(default=None, ge=0, le=240)
    battery_low_pct: int | None = Field(default=None, ge=5, le=50)
    battery_critical_pct: int | None = Field(default=None, ge=1, le=30)
    integrations: Integrations | None = None

    @model_validator(mode="after")
    def check_battery(self):
        if self.battery_low_pct is not None and self.battery_critical_pct is not None and self.battery_critical_pct >= self.battery_low_pct:
            raise ValueError("The critical battery level must be below the low battery level")
        return self


class SimAdvance(Strict):
    ticks: int = Field(default=1, ge=1, le=240)


class SimScenario(Strict):
    scenario: str


class SimAutoRun(Strict):
    auto_run: bool


class SimFault(Strict):
    fault: Literal["none", "desaturation", "low_battery", "sensor", "disconnect"]
