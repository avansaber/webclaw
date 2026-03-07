"""Expansion trigger rules for Adaptive ERP.

Defines threshold-based rules that suggest new skills when usage
counters exceed certain values.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TriggerRule:
    """A rule that fires when entity counts exceed a threshold."""
    id: str
    entity_type: str
    threshold: int
    suggested_skill: str
    message_template: str
    # Optional: only fire if a prerequisite skill IS active
    requires_active: str | None = None


# Expansion trigger rules (v2 packages)
TRIGGER_RULES: list[TriggerRule] = [
    TriggerRule(
        id="trigger-dental",
        entity_type="patient",
        threshold=15,
        suggested_skill="healthclaw-dental",
        message_template="You've registered {n} patients. Want to enable tooth charts and CDT codes?",
    ),
    TriggerRule(
        id="trigger-people",
        entity_type="employee",
        threshold=5,
        suggested_skill="erpclaw-people",
        message_template="You have {n} team members. Ready to track leave, attendance, and payroll?",
    ),
    TriggerRule(
        id="trigger-growth",
        entity_type="customer",
        threshold=10,
        suggested_skill="erpclaw-growth",
        message_template="{n} customers and growing. Want lead tracking, CRM, and analytics?",
    ),
    TriggerRule(
        id="trigger-ops-projects",
        entity_type="project",
        threshold=3,
        suggested_skill="erpclaw-ops",
        message_template="{n} active projects. Want task tracking, timesheets, and asset management?",
    ),
    TriggerRule(
        id="trigger-ops-assets",
        entity_type="asset",
        threshold=5,
        suggested_skill="erpclaw-ops",
        message_template="{n} assets. Want depreciation schedules and disposal tracking?",
    ),
    TriggerRule(
        id="trigger-ops-manufacturing",
        entity_type="work_order",
        threshold=5,
        suggested_skill="erpclaw-ops",
        message_template="{n} work orders. Want BOM management and MRP?",
    ),
    TriggerRule(
        id="trigger-ops-support",
        entity_type="support_ticket",
        threshold=10,
        suggested_skill="erpclaw-ops",
        message_template="{n} support requests. Want SLA tracking and warranty management?",
    ),
    TriggerRule(
        id="trigger-mental-health",
        entity_type="encounter",
        threshold=20,
        suggested_skill="healthclaw-mental",
        message_template="{n} patient encounters. Want mental health assessments (PHQ-9, GAD-7)?",
    ),
    TriggerRule(
        id="trigger-educlaw-scheduling",
        entity_type="section",
        threshold=10,
        suggested_skill="educlaw-scheduling",
        message_template="You have {n} course sections. Want automated scheduling and room assignment?",
        requires_active="educlaw",
    ),
    TriggerRule(
        id="trigger-educlaw-lms",
        entity_type="course_enrollment",
        threshold=30,
        suggested_skill="educlaw-lms",
        message_template="{n} course enrollments. Ready for online gradebooks and assignment management?",
        requires_active="educlaw",
    ),
    TriggerRule(
        id="trigger-educlaw-statereport",
        entity_type="student",
        threshold=50,
        suggested_skill="educlaw-statereport",
        message_template="{n} students enrolled. Want automated state reporting and Ed-Fi compliance?",
        requires_active="educlaw",
    ),
]
