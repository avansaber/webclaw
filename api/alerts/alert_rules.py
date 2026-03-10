"""Predictive alert rules — evaluated against installed skill data.

Each rule calls a skill action and checks a condition on the result.
Only rules for installed skills are evaluated.
"""
from dataclasses import dataclass, field


@dataclass
class AlertRule:
    """A single alert rule definition."""
    skill: str
    action: str
    params: dict = field(default_factory=dict)
    needs_company_id: bool = False   # auto-inject company-id at evaluation time
    field: str = "total_count"       # response field to check
    condition: str = "gt"            # gt, gte, lt, eq
    threshold: int | float = 0
    severity: str = "warning"        # warning, critical, info
    message_template: str = ""       # Python format string, gets {value}
    link_path: str = ""              # relative URL path for "View" link


def _check_condition(value: int | float, condition: str, threshold: int | float) -> bool:
    if condition == "gt":
        return value > threshold
    if condition == "gte":
        return value >= threshold
    if condition == "lt":
        return value < threshold
    if condition == "eq":
        return value == threshold
    return False


# ── Predefined alert rules ────────────────────────────────────────────────

ALERT_RULES: list[AlertRule] = [
    # ── ERPClaw core ─────────────────────────────────────────────────────
    AlertRule(
        skill="erpclaw",
        action="list-sales-invoices",
        params={"status": "overdue"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} overdue invoice(s)",
        link_path="/skills/erpclaw/sales-invoices?status=overdue",
    ),
    AlertRule(
        skill="erpclaw",
        action="list-sales-orders",
        params={"status": "draft"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="info",
        message_template="{value} draft sales order(s)",
        link_path="/skills/erpclaw/sales-orders?status=draft",
    ),
    AlertRule(
        skill="erpclaw",
        action="list-items",
        params={"below-reorder": "1"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} item(s) below reorder level",
        link_path="/skills/erpclaw/items?below-reorder=1",
    ),
    AlertRule(
        skill="erpclaw",
        action="list-purchase-orders",
        params={"status": "draft"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="info",
        message_template="{value} draft purchase order(s)",
        link_path="/skills/erpclaw/purchase-orders?status=draft",
    ),
    AlertRule(
        skill="erpclaw",
        action="list-leave-requests",
        params={"status": "pending"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} pending leave request(s)",
        link_path="/skills/erpclaw/leave-requests?status=pending",
    ),
    AlertRule(
        skill="erpclaw",
        action="list-payments",
        params={"status": "unreconciled"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="info",
        message_template="{value} unreconciled payment(s)",
        link_path="/skills/erpclaw/payments?status=unreconciled",
    ),
    AlertRule(
        skill="erpclaw-ops",
        action="list-issues",
        params={"status": "open"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} open support ticket(s)",
        link_path="/skills/erpclaw-ops/issues?status=open",
    ),
    AlertRule(
        skill="erpclaw-ops",
        action="list-work-orders",
        params={"status": "overdue"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} overdue work order(s)",
        link_path="/skills/erpclaw-ops/work-orders?status=overdue",
    ),
    AlertRule(
        skill="erpclaw-ops",
        action="list-inspections",
        params={"status": "pending"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="info",
        message_template="{value} pending quality inspection(s)",
        link_path="/skills/erpclaw-ops/inspections?status=pending",
    ),
    AlertRule(
        skill="erpclaw-ops",
        action="list-tasks",
        params={"status": "overdue"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} overdue project task(s)",
        link_path="/skills/erpclaw-ops/tasks?status=overdue",
    ),

    # ── PropertyClaw ──────────────────────────────────────────────────────
    AlertRule(
        skill="propertyclaw",
        action="list-work-orders",
        params={"status": "open"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} open maintenance request(s)",
        link_path="/skills/propertyclaw/work-orders?status=open",
    ),
    AlertRule(
        skill="propertyclaw",
        action="list-leases",
        params={"status": "expiring"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="warning",
        message_template="{value} lease(s) expiring soon",
        link_path="/skills/propertyclaw/leases?status=expiring",
    ),
    AlertRule(
        skill="propertyclaw",
        action="list-applications",
        params={"status": "pending"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="info",
        message_template="{value} pending tenant application(s)",
        link_path="/skills/propertyclaw/applications?status=pending",
    ),

    # ── HealthClaw ───────────────────────────────────────────────────────
    AlertRule(
        skill="healthclaw",
        action="list-appointments",
        params={"status": "scheduled"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="info",
        message_template="{value} upcoming appointment(s)",
        link_path="/skills/healthclaw/appointments?status=scheduled",
    ),
    AlertRule(
        skill="healthclaw",
        action="list-claims",
        params={"status": "rejected"},
        needs_company_id=True,
        field="total_count",
        condition="gt",
        threshold=0,
        severity="critical",
        message_template="{value} rejected insurance claim(s)",
        link_path="/skills/healthclaw/claims?status=rejected",
    ),
]


def get_rules_for_skills(installed_skills: set[str]) -> list[AlertRule]:
    """Return only rules whose skill is installed."""
    return [r for r in ALERT_RULES if r.skill in installed_skills]
