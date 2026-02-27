#!/usr/bin/env python3
"""Generate UI.yaml files for erpclaw skills from schema + SKILL.md data.

Usage:
    python3 generate_ui_yaml.py                    # Generate for all skills without UI.yaml
    python3 generate_ui_yaml.py erpclaw-journals   # Generate for a specific skill
    python3 generate_ui_yaml.py --validate         # Validate all existing UI.yaml files
"""

import json
import os
import re
import sys
import urllib.request
from collections import OrderedDict

# ── Configuration ─────────────────────────────────────────────────────────────

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN_ROOT = os.path.join(os.path.dirname(REPO_ROOT), "..", "erpclaw")
INIT_DB_PATH = os.path.join(PLAN_ROOT, "init_db.py")
SKILLS_REPO_ROOT = os.path.dirname(REPO_ROOT)  # parent of erpclaw-web

# API base for param schema (can override with env var)
API_BASE = os.environ.get("API_BASE", "http://localhost:8001")

# Skills that already have hand-crafted UI.yaml (skip these)
SKIP_SKILLS = {"erpclaw-setup", "erpclaw-gl", "erpclaw-inventory", "erpclaw-selling", "erpclaw-buying"}

# Skill → display info
SKILL_META = {
    "erpclaw-journals": {"display_name": "Journal Entries", "icon": "book-open", "color": "#8b5cf6"},
    "erpclaw-payments": {"display_name": "Payments", "icon": "credit-card", "color": "#06b6d4"},
    "erpclaw-tax": {"display_name": "Tax Management", "icon": "receipt", "color": "#f59e0b"},
    "erpclaw-reports": {"display_name": "Financial Reports", "icon": "bar-chart-3", "color": "#10b981"},
    "erpclaw-manufacturing": {"display_name": "Manufacturing", "icon": "factory", "color": "#f97316"},
    "erpclaw-hr": {"display_name": "Human Resources", "icon": "users", "color": "#8b5cf6"},
    "erpclaw-payroll": {"display_name": "Payroll", "icon": "wallet", "color": "#ec4899"},
    "erpclaw-projects": {"display_name": "Projects & Tasks", "icon": "kanban", "color": "#6366f1"},
    "erpclaw-assets": {"display_name": "Asset Management", "icon": "landmark", "color": "#14b8a6"},
    "erpclaw-quality": {"display_name": "Quality Control", "icon": "shield-check", "color": "#22c55e"},
    "erpclaw-crm": {"display_name": "CRM", "icon": "contact", "color": "#3b82f6"},
    "erpclaw-support": {"display_name": "Support & Helpdesk", "icon": "headphones", "color": "#a855f7"},
    "erpclaw-billing": {"display_name": "Subscriptions & Billing", "icon": "repeat", "color": "#0ea5e9"},
    "erpclaw-ai-engine": {"display_name": "AI Engine", "icon": "brain", "color": "#f43f5e"},
    "erpclaw-analytics": {"display_name": "Analytics & KPIs", "icon": "line-chart", "color": "#84cc16"},
    "erpclaw-region-in": {"display_name": "India Compliance", "icon": "flag", "color": "#ff9933"},
    "erpclaw-region-ca": {"display_name": "Canada Compliance", "icon": "flag", "color": "#ff0000"},
    "erpclaw-region-uk": {"display_name": "UK Compliance", "icon": "flag", "color": "#012169"},
    "erpclaw-region-eu": {"display_name": "EU Compliance", "icon": "flag", "color": "#003399"},
}

# Skill → list of primary tables it owns (must match actual init_db.py table names)
SKILL_TABLES = {
    "erpclaw-journals": [
        "journal_entry", "journal_entry_line",
    ],
    "erpclaw-payments": [
        "payment_entry", "payment_allocation", "payment_deduction",
        "payment_terms", "payment_ledger_entry",
    ],
    "erpclaw-tax": [
        "tax_template", "tax_template_line", "tax_rule", "tax_category",
        "tax_withholding_category", "tax_withholding_entry", "tax_withholding_group",
        "item_tax_template",
    ],
    "erpclaw-reports": [],  # Reports skill reads from other tables, doesn't own entities
    "erpclaw-manufacturing": [
        "bom", "bom_item", "bom_operation", "work_order", "work_order_item",
        "workstation", "operation", "routing", "routing_operation",
        "production_plan", "production_plan_item", "production_plan_material",
        "job_card", "subcontracting_order",
    ],
    "erpclaw-hr": [
        "employee", "department", "designation", "employee_grade",
        "employee_lifecycle_event", "leave_type", "leave_application",
        "leave_allocation", "attendance", "holiday_list", "holiday",
        "expense_claim", "expense_claim_item",
        "employee_tax_exemption_category", "employee_tax_exemption_declaration",
    ],
    "erpclaw-payroll": [
        "salary_structure", "salary_structure_detail", "salary_slip",
        "salary_slip_detail", "salary_component", "payroll_run",
        "salary_assignment", "income_tax_slab", "income_tax_slab_rate",
        "fica_config", "futa_suta_config", "wage_garnishment",
    ],
    "erpclaw-projects": [
        "project", "task", "timesheet", "timesheet_detail", "milestone",
    ],
    "erpclaw-assets": [
        "asset", "asset_category", "asset_movement", "depreciation_schedule",
        "asset_disposal", "asset_maintenance",
    ],
    "erpclaw-quality": [
        "quality_inspection", "quality_inspection_reading",
        "quality_inspection_template", "quality_inspection_parameter",
        "non_conformance", "quality_goal",
    ],
    "erpclaw-crm": [
        "lead", "opportunity", "campaign", "campaign_lead",
        "lead_source", "crm_activity", "communication",
    ],
    "erpclaw-support": [
        "issue", "issue_comment", "service_level_agreement",
        "warranty_claim",
    ],
    "erpclaw-billing": [
        "meter", "meter_reading", "usage_event", "rate_plan", "rate_tier",
        "billing_period", "billing_adjustment", "prepaid_credit_balance",
        "recurring_invoice_template", "recurring_invoice_template_item",
    ],
    "erpclaw-ai-engine": [
        "anomaly", "scenario", "business_rule", "categorization_rule",
        "correlation", "cash_flow_forecast", "pending_decision",
        "audit_conversation", "conversation_context",
    ],
    "erpclaw-analytics": [],  # Analytics reads, doesn't own entities
    "erpclaw-region-in": [
        "regional_settings",  # Shared table; region-specific tables created by skill at runtime
    ],
    "erpclaw-region-ca": [
        "regional_settings",
    ],
    "erpclaw-region-uk": [
        "regional_settings",
    ],
    "erpclaw-region-eu": [
        "regional_settings",
    ],
}

# Hard-coded action lists from SKILL.md frontmatter (avoids needing API at generation time)
SKILL_ACTIONS = {
    "erpclaw-journals": [
        "add-journal-entry", "update-journal-entry", "get-journal-entry",
        "list-journal-entries", "submit-journal-entry", "cancel-journal-entry",
        "amend-journal-entry", "delete-journal-entry", "duplicate-journal-entry",
        "status",
    ],
    "erpclaw-payments": [
        "add-payment", "update-payment", "get-payment", "list-payments",
        "submit-payment", "cancel-payment", "delete-payment",
        "create-payment-ledger-entry", "get-outstanding", "get-unallocated-payments",
        "allocate-payment", "reconcile-payments", "bank-reconciliation", "status",
    ],
    "erpclaw-tax": [
        "add-tax-template", "update-tax-template", "get-tax-template",
        "list-tax-templates", "delete-tax-template", "resolve-tax-template",
        "calculate-tax", "add-tax-category", "list-tax-categories",
        "add-tax-rule", "list-tax-rules", "add-item-tax-template",
        "add-tax-withholding-category", "get-withholding-details",
        "record-withholding-entry", "record-1099-payment",
        "generate-1099-data", "status",
    ],
    "erpclaw-reports": [
        "trial-balance", "profit-and-loss", "balance-sheet", "cash-flow",
        "general-ledger", "party-ledger", "ar-aging", "ap-aging",
        "budget-vs-actual", "tax-summary", "payment-summary", "gl-summary",
        "comparative-pl", "status",
    ],
    "erpclaw-manufacturing": [
        "add-operation", "add-workstation", "add-routing", "add-bom",
        "update-bom", "get-bom", "list-boms", "explode-bom",
        "add-work-order", "get-work-order", "list-work-orders",
        "start-work-order", "cancel-work-order", "transfer-materials",
        "complete-work-order", "create-job-card", "complete-job-card",
        "create-production-plan", "run-mrp", "get-production-plan",
        "generate-work-orders", "generate-purchase-requests",
        "add-subcontracting-order", "status",
    ],
    "erpclaw-hr": [
        "add-employee", "update-employee", "get-employee", "list-employees",
        "add-department", "list-departments", "add-designation", "list-designations",
        "add-leave-type", "list-leave-types", "add-leave-allocation",
        "get-leave-balance", "add-leave-application", "approve-leave",
        "reject-leave", "list-leave-applications", "mark-attendance",
        "bulk-mark-attendance", "list-attendance", "add-holiday-list",
        "add-expense-claim", "submit-expense-claim", "approve-expense-claim",
        "reject-expense-claim", "update-expense-claim-status",
        "list-expense-claims", "record-lifecycle-event", "status",
    ],
    "erpclaw-payroll": [
        "add-salary-component", "list-salary-components",
        "add-salary-structure", "get-salary-structure", "list-salary-structures",
        "add-salary-assignment", "list-salary-assignments",
        "create-payroll-run", "generate-salary-slips", "get-salary-slip",
        "list-salary-slips", "submit-payroll-run", "cancel-payroll-run",
        "add-income-tax-slab", "update-fica-config", "update-futa-suta-config",
        "generate-w2-data", "status",
    ],
    "erpclaw-projects": [
        "add-project", "update-project", "get-project", "list-projects",
        "add-task", "update-task", "list-tasks", "add-milestone",
        "update-milestone", "add-timesheet", "get-timesheet", "list-timesheets",
        "submit-timesheet", "bill-timesheet", "project-profitability",
        "gantt-data", "resource-utilization", "status",
    ],
    "erpclaw-assets": [
        "add-asset-category", "list-asset-categories", "add-asset",
        "update-asset", "get-asset", "list-assets",
        "generate-depreciation-schedule", "post-depreciation", "run-depreciation",
        "record-asset-movement", "schedule-maintenance", "complete-maintenance",
        "dispose-asset", "asset-register-report", "depreciation-summary", "status",
    ],
    "erpclaw-quality": [
        "add-inspection-template", "get-inspection-template",
        "list-inspection-templates", "add-quality-inspection",
        "record-inspection-readings", "evaluate-inspection",
        "list-quality-inspections", "add-non-conformance",
        "update-non-conformance", "list-non-conformances",
        "add-quality-goal", "update-quality-goal", "quality-dashboard", "status",
    ],
    "erpclaw-crm": [
        "add-lead", "update-lead", "get-lead", "list-leads",
        "convert-lead-to-opportunity", "add-opportunity", "update-opportunity",
        "get-opportunity", "list-opportunities",
        "convert-opportunity-to-quotation", "mark-opportunity-won",
        "mark-opportunity-lost", "add-campaign", "list-campaigns",
        "add-activity", "list-activities", "pipeline-report", "status",
    ],
    "erpclaw-support": [
        "add-issue", "update-issue", "get-issue", "list-issues",
        "add-issue-comment", "resolve-issue", "reopen-issue",
        "add-sla", "list-slas", "add-warranty-claim",
        "update-warranty-claim", "list-warranty-claims",
        "add-maintenance-schedule", "list-maintenance-schedules",
        "record-maintenance-visit", "sla-compliance-report",
        "overdue-issues-report", "status",
    ],
    "erpclaw-billing": [
        "add-meter", "update-meter", "get-meter", "list-meters",
        "add-meter-reading", "list-meter-readings",
        "add-usage-event", "add-usage-events-batch",
        "add-rate-plan", "update-rate-plan", "get-rate-plan", "list-rate-plans",
        "rate-consumption", "create-billing-period", "run-billing",
        "generate-invoices", "add-billing-adjustment",
        "list-billing-periods", "get-billing-period",
        "add-prepaid-credit", "get-prepaid-balance", "status",
    ],
    "erpclaw-ai-engine": [
        "detect-anomalies", "list-anomalies", "acknowledge-anomaly",
        "dismiss-anomaly", "forecast-cash-flow", "get-forecast",
        "create-scenario", "list-scenarios", "add-business-rule",
        "list-business-rules", "evaluate-business-rules",
        "add-categorization-rule", "categorize-transaction",
        "discover-correlations", "list-correlations", "score-relationship",
        "list-relationship-scores", "save-conversation-context",
        "get-conversation-context", "add-pending-decision",
        "log-audit-conversation", "status",
    ],
    "erpclaw-analytics": [
        "status", "available-metrics", "liquidity-ratios", "profitability-ratios",
        "efficiency-ratios", "revenue-by-customer", "revenue-by-item",
        "revenue-trend", "customer-concentration", "expense-breakdown",
        "cost-trend", "opex-vs-capex", "abc-analysis", "inventory-turnover",
        "aging-inventory", "headcount-analytics", "payroll-analytics",
        "leave-utilization", "project-profitability", "quality-dashboard",
        "support-metrics", "executive-dashboard", "company-scorecard",
        "metric-trend", "period-comparison",
    ],
    "erpclaw-region-in": [
        "seed-india-defaults", "setup-gst", "validate-gstin", "validate-pan",
        "compute-gst", "list-hsn-codes", "status", "add-hsn-code",
        "add-reverse-charge-rule", "compute-itc", "generate-gstr1",
        "generate-gstr3b", "generate-hsn-summary", "generate-einvoice-payload",
        "generate-eway-bill-payload", "seed-indian-coa", "tds-withhold",
        "generate-tds-return", "india-tax-summary", "available-reports",
        "seed-india-payroll", "compute-pf", "compute-esi",
        "compute-professional-tax", "compute-tds-on-salary", "generate-form16",
        "generate-form24q", "india-payroll-summary",
        "validate-aadhaar", "validate-tan",
    ],
    "erpclaw-region-ca": [
        "validate-business-number", "validate-sin", "compute-gst", "compute-hst",
        "compute-pst", "compute-qst", "compute-sales-tax", "list-tax-rates",
        "compute-itc", "seed-ca-defaults", "setup-gst-hst", "seed-ca-coa",
        "seed-ca-payroll", "compute-cpp", "compute-cpp2", "compute-qpp",
        "compute-ei", "compute-federal-tax", "compute-provincial-tax",
        "compute-total-payroll-deductions", "ca-payroll-summary",
        "generate-gst-hst-return", "generate-qst-return", "generate-t4",
        "generate-t4a", "generate-roe", "generate-pd7a", "ca-tax-summary",
        "available-reports", "status",
    ],
    "erpclaw-region-uk": [
        "seed-uk-defaults", "setup-vat", "seed-uk-coa", "seed-uk-payroll",
        "validate-vat-number", "validate-utr", "validate-nino", "validate-crn",
        "compute-vat", "compute-vat-inclusive", "list-vat-rates",
        "compute-flat-rate-vat", "generate-vat-return", "generate-mtd-payload",
        "generate-ec-sales-list", "compute-paye", "compute-ni",
        "compute-student-loan", "compute-pension", "uk-payroll-summary",
        "generate-fps", "generate-eps", "generate-p60", "generate-p45",
        "compute-cis-deduction", "uk-tax-summary", "available-reports", "status",
    ],
    "erpclaw-region-eu": [
        "seed-eu-defaults", "setup-eu-vat", "seed-eu-coa",
        "validate-eu-vat-number", "validate-iban", "validate-eori",
        "check-vies-format", "compute-vat", "compute-reverse-charge",
        "list-eu-vat-rates", "compute-oss-vat",
        "check-distance-selling-threshold", "triangulation-check",
        "generate-vat-return", "generate-ec-sales-list", "generate-saft-export",
        "generate-intrastat-dispatches", "generate-intrastat-arrivals",
        "generate-einvoice-en16931", "generate-oss-return",
        "compute-withholding-tax", "list-eu-countries", "list-intrastat-codes",
        "eu-tax-summary", "available-reports", "status",
    ],
}

# Cross-skill entity lookups: action → owning skill
CROSS_SKILL_MAP = {
    "list-companies": "erpclaw-setup",
    "list-currencies": "erpclaw-setup",
    "list-payment-terms": "erpclaw-setup",
    "list-uoms": "erpclaw-setup",
    "list-accounts": "erpclaw-gl",
    "list-cost-centers": "erpclaw-gl",
    "list-fiscal-years": "erpclaw-gl",
    "list-items": "erpclaw-inventory",
    "list-warehouses": "erpclaw-inventory",
    "list-item-groups": "erpclaw-inventory",
    "list-batches": "erpclaw-inventory",
    "list-customers": "erpclaw-selling",
    "list-sales-orders": "erpclaw-selling",
    "list-sales-invoices": "erpclaw-selling",
    "list-delivery-notes": "erpclaw-selling",
    "list-suppliers": "erpclaw-buying",
    "list-purchase-orders": "erpclaw-buying",
    "list-purchase-invoices": "erpclaw-buying",
    "list-purchase-receipts": "erpclaw-buying",
    "list-employees": "erpclaw-hr",
    "list-projects": "erpclaw-projects",
    "list-tasks": "erpclaw-projects",
    "list-assets": "erpclaw-assets",
    "list-tax-templates": "erpclaw-tax",
}

# ── Schema Parser ─────────────────────────────────────────────────────────────

def parse_init_db(path: str) -> dict[str, list[dict]]:
    """Parse init_db.py to extract CREATE TABLE definitions.

    Returns: {table_name: [{name, type, notnull, pk, default, fk_table, fk_col}, ...]}
    """
    if not os.path.exists(path):
        # Try alternative paths (relative to repo root, then common locations)
        for alt in [
            os.path.join(os.path.dirname(REPO_ROOT), "..", "init_db.py"),
            os.path.expanduser("~/.openclaw/erpclaw/init_db.py"),
        ]:
            if os.path.exists(alt):
                path = alt
                break

    with open(path) as f:
        content = f.read()

    tables = {}

    # Extract CREATE TABLE blocks by counting parentheses (handles nested CHECK constraints)
    create_re = re.compile(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(', re.I)
    pos = 0
    while pos < len(content):
        m = create_re.search(content, pos)
        if not m:
            break
        table_name = m.group(1)
        # Find matching closing paren by counting depth
        start = m.end()
        depth = 1
        i = start
        while i < len(content) and depth > 0:
            if content[i] == '(':
                depth += 1
            elif content[i] == ')':
                depth -= 1
            i += 1
        body = content[start:i - 1]
        pos = i

        # Join multi-line column definitions (lines starting with whitespace after CHECK/DEFAULT)
        # by collapsing each column into a single logical line
        logical_lines = []
        for raw_line in body.split("\n"):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("--"):
                continue
            # If line starts with a word followed by TEXT/INTEGER/REAL/BLOB → new column
            if re.match(r'^(\w+)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)', stripped, re.I):
                logical_lines.append(stripped)
            elif logical_lines:
                # Continuation of previous column (CHECK, multi-line constraint)
                logical_lines[-1] += " " + stripped

        columns = []
        for line in logical_lines:
            line = line.rstrip(",").strip()
            # Skip table-level constraints
            if re.match(r'(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK)\s*\(', line, re.I):
                continue

            # Parse column: name TYPE [rest...]
            col_match = re.match(r'^(\w+)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)(.*)', line, re.I)
            if not col_match:
                continue

            col_name = col_match.group(1)
            col_type = col_match.group(2).upper()
            rest = col_match.group(3) or ""

            col = {
                "name": col_name,
                "type": col_type,
                "notnull": bool(re.search(r'\bNOT\s+NULL\b', rest, re.I)),
                "pk": bool(re.search(r'\bPRIMARY\s+KEY\b', rest, re.I)),
                "default": None,
                "fk_table": None,
                "fk_col": None,
            }

            # Extract DEFAULT
            def_match = re.search(r"DEFAULT\s+'([^']*)'", rest, re.I)
            if not def_match:
                def_match = re.search(r"DEFAULT\s+(\S+)", rest, re.I)
            if def_match:
                val = def_match.group(1)
                if not val.startswith("("):  # Skip DEFAULT (datetime('now'))
                    col["default"] = val

            # Extract REFERENCES
            ref_match = re.search(r"REFERENCES\s+(\w+)\s*\((\w+)\)", rest, re.I)
            if ref_match:
                col["fk_table"] = ref_match.group(1)
                col["fk_col"] = ref_match.group(2)

            # Extract CHECK ... IN ('val1','val2',...) constraints
            check_match = re.search(
                r"CHECK\s*\(\s*\w+\s+IN\s*\(([^)]+)\)\s*\)", rest, re.I
            )
            if check_match:
                raw_vals = check_match.group(1)
                vals = re.findall(r"'([^']*)'", raw_vals)
                if vals and set(vals) not in ({"0", "1"}, {"0"}, {"1"}):
                    col["check_values"] = vals

            columns.append(col)

        if columns:
            tables[table_name] = columns

    return tables


# ── Field Type Inference ──────────────────────────────────────────────────────

def infer_ui_field_type(col: dict, table_name: str) -> dict:
    """Infer UI.yaml field type and properties from a schema column."""
    name = col["name"]
    sql_type = col["type"]

    field: dict = {
        "type": "text",
        "label": name_to_label(name),
    }

    # Primary key
    if col["pk"] or name == "id":
        field["type"] = "text"
        field["read_only"] = True
        field["hidden"] = True
        return field

    # Foreign key → entity lookup
    if col["fk_table"] and name.endswith("_id"):
        field["type"] = "link"
        entity = col["fk_table"]
        field["link_entity"] = entity
        field["link_display_field"] = "name"
        search_action = infer_list_action(entity)
        if search_action:
            field["link_search_action"] = search_action
        return field

    # _id suffix without FK → still likely a lookup
    if name.endswith("_id") and name != "id":
        entity_name = name[:-3]  # remove _id
        field["type"] = "link"
        field["link_entity"] = entity_name
        field["link_display_field"] = "name"
        search_action = infer_list_action(entity_name)
        if search_action:
            field["link_search_action"] = search_action
        return field

    # Timestamps
    if name in ("created_at", "updated_at", "modified_at"):
        field["type"] = "datetime"
        field["read_only"] = True
        return field

    # Status fields — prefer CHECK constraint values from schema
    if name == "status" or name == "docstatus":
        field["type"] = "select"
        if col.get("check_values"):
            field["options"] = [
                {"value": v, "label": name_to_label(v)} for v in col["check_values"]
            ]
        else:
            field["options"] = infer_status_options(table_name)
        return field

    # CHECK constraint select fields (non-status, non-boolean)
    if col.get("check_values"):
        field["type"] = "select"
        field["options"] = [
            {"value": v, "label": name_to_label(v)} for v in col["check_values"]
        ]
        if col["notnull"]:
            field["required"] = True
        return field

    # Date fields
    if name.endswith("_date") or name in (
        "posting_date", "due_date", "from_date", "to_date",
        "start_date", "end_date", "effective_from", "effective_to",
        "valid_from", "valid_to", "transaction_date", "order_date",
        "delivery_date", "bill_date", "date_of_birth", "date_of_joining",
        "date_of_retirement", "relieving_date",
    ):
        field["type"] = "date"
        return field

    # Currency fields
    currency_patterns = (
        "amount", "total", "price", "rate", "balance", "cost",
        "revenue", "outstanding", "paid", "credit", "debit",
        "salary", "wage", "net_pay", "gross_pay", "tax_amount",
        "discount", "grand_total", "base_amount", "net_amount",
        "base_total", "base_grand_total",
    )
    if any(p in name for p in currency_patterns) and sql_type == "TEXT":
        field["type"] = "currency"
        field["precision"] = 2
        return field

    # Quantity fields
    if name in ("qty", "quantity", "stock_qty", "delivered_qty",
                 "invoiced_qty", "received_qty", "ordered_qty",
                 "actual_qty", "projected_qty"):
        field["type"] = "quantity"
        return field

    # Percent fields
    if "percent" in name or "rate" in name and "rate" != name:
        if "discount" in name or "percent" in name:
            field["type"] = "percent"
            return field

    # Integer fields
    if sql_type == "INTEGER" and name not in ("id",):
        field["type"] = "integer"
        return field

    # Number fields
    if sql_type == "REAL":
        field["type"] = "number"
        return field

    # Textarea fields
    if name in ("description", "remarks", "notes", "comment",
                 "reason", "address", "terms", "message",
                 "resolution", "root_cause"):
        field["type"] = "textarea"
        return field

    # Boolean fields
    if name.startswith(("is_", "has_", "enable_", "exempt_",
                        "include_", "allow_", "auto_")):
        field["type"] = "boolean"
        return field

    # Naming series
    if name == "naming_series" or name == "series":
        field["type"] = "text"
        field["read_only"] = True
        return field

    # Default: text
    if col["notnull"]:
        field["required"] = True

    return field


def name_to_label(name: str) -> str:
    """Convert snake_case to Title Case label."""
    return name.replace("_", " ").title().replace("Id", "ID").replace("Uom", "UOM")


def infer_list_action(entity_name: str) -> str | None:
    """Infer the list action for an entity name."""
    kebab = entity_name.replace("_", "-")
    # Handle common pluralization
    if kebab.endswith("y") and not kebab.endswith("ey"):
        plural = kebab[:-1] + "ies"
    elif kebab.endswith("s") or kebab.endswith("x") or kebab.endswith("ch"):
        plural = kebab + "es"
    else:
        plural = kebab + "s"
    return f"list-{plural}"


def infer_status_options(table_name: str) -> list[dict]:
    """Infer status options based on table context."""
    # Common lifecycle
    if table_name in ("journal_entry", "payment_entry", "salary_slip",
                       "expense_claim", "leave_application"):
        return [
            {"value": "draft", "label": "Draft"},
            {"value": "submitted", "label": "Submitted"},
            {"value": "cancelled", "label": "Cancelled"},
        ]
    if table_name in ("issue", "warranty_claim"):
        return [
            {"value": "open", "label": "Open"},
            {"value": "in_progress", "label": "In Progress"},
            {"value": "resolved", "label": "Resolved"},
            {"value": "closed", "label": "Closed"},
        ]
    if table_name in ("lead",):
        return [
            {"value": "new", "label": "New"},
            {"value": "contacted", "label": "Contacted"},
            {"value": "qualified", "label": "Qualified"},
            {"value": "converted", "label": "Converted"},
            {"value": "lost", "label": "Lost"},
        ]
    if table_name in ("opportunity",):
        return [
            {"value": "open", "label": "Open"},
            {"value": "quotation", "label": "Quotation"},
            {"value": "won", "label": "Won"},
            {"value": "lost", "label": "Lost"},
        ]
    if table_name in ("subscription",):
        return [
            {"value": "active", "label": "Active"},
            {"value": "paused", "label": "Paused"},
            {"value": "cancelled", "label": "Cancelled"},
            {"value": "past_due", "label": "Past Due"},
        ]
    if table_name in ("project",):
        return [
            {"value": "open", "label": "Open"},
            {"value": "in_progress", "label": "In Progress"},
            {"value": "completed", "label": "Completed"},
            {"value": "cancelled", "label": "Cancelled"},
        ]
    if table_name in ("task",):
        return [
            {"value": "open", "label": "Open"},
            {"value": "working", "label": "Working"},
            {"value": "completed", "label": "Completed"},
            {"value": "cancelled", "label": "Cancelled"},
        ]
    # Default: draft/submit/cancel
    return [
        {"value": "draft", "label": "Draft"},
        {"value": "submitted", "label": "Submitted"},
        {"value": "cancelled", "label": "Cancelled"},
    ]


# ── Child Table Parameter Name Map ────────────────────────────────────────────
# Maps child_table_name → CLI parameter name used by the skill's db_query.py.
# Default is "items" for any child table not listed here.

CHILD_PARAM_MAP = {
    # erpclaw-journals
    "journal_entry_line": "lines",
    # erpclaw-tax
    "tax_template_line": "lines",
    # erpclaw-payroll
    "salary_structure_component": "components",
    "salary_slip_component": "components",
    # erpclaw-quality
    "inspection_template_parameter": "items",
    "quality_inspection_reading": "readings",
    # erpclaw-manufacturing
    "bom_item": "items",
    "bom_operation": "operations",
    "work_order_item": "items",
    "work_order_operation": "operations",
    # erpclaw-hr
    "expense_claim_item": "items",
    # erpclaw-inventory
    "stock_entry_item": "items",
    "stock_reconciliation_item": "items",
    # erpclaw-selling
    "quotation_item": "items",
    "sales_order_item": "items",
    "sales_invoice_item": "items",
    "delivery_note_item": "items",
    # erpclaw-buying
    "purchase_order_item": "items",
    "purchase_receipt_item": "items",
    "purchase_invoice_item": "items",
    "rfq_item": "items",
    "supplier_quotation_item": "items",
    "material_request_item": "items",
}


# ── Entity Classifier ─────────────────────────────────────────────────────────

def classify_tables(tables: list[str], schema: dict) -> tuple[list[str], list[str]]:
    """Classify tables into parent entities and child entities.

    Child tables: have a foreign key pointing to another table in the same skill,
    and typically have "_item", "_detail", "_reading", "_line" etc. suffix.
    """
    child_suffixes = (
        "_item", "_detail", "_reading", "_account", "_parameter",
        "_employee", "_operation", "_supplier", "_priority",
        "_reference", "_schedule", "_line", "_lead", "_rate",
        "_tier", "_charge", "_comment", "_material",
    )

    parents = []
    children = []

    for table in tables:
        if not schema.get(table):
            continue
        is_child = False
        for suffix in child_suffixes:
            if table.endswith(suffix):
                # Try to find a parent in this skill set
                parent_candidate = table[:table.rfind(suffix)]
                if parent_candidate in tables:
                    children.append(table)
                    is_child = True
                    break
        if not is_child:
            parents.append(table)

    return parents, children


def find_parent_table(child_table: str, parent_tables: list[str], schema: dict) -> str | None:
    """Find the parent table for a child table."""
    cols = schema.get(child_table, [])
    for col in cols:
        if col["fk_table"] and col["fk_table"] in parent_tables:
            return col["fk_table"]
    # Fallback: derive from name
    for suffix in ("_item", "_detail", "_reading", "_account", "_parameter",
                    "_employee", "_operation", "_supplier", "_priority",
                    "_reference", "_schedule", "_line", "_lead", "_rate",
                    "_tier", "_charge", "_comment", "_material"):
        if child_table.endswith(suffix):
            parent = child_table[:child_table.rfind(suffix)]
            if parent in parent_tables:
                return parent
    return None


# ── Action Fetcher ────────────────────────────────────────────────────────────

def fetch_params(skill: str) -> dict | None:
    """Fetch param schema from the API."""
    try:
        url = f"{API_BASE}/api/v1/schema/params/{skill}"
        resp = urllib.request.urlopen(url, timeout=5)
        data = json.loads(resp.read())
        if data.get("status") == "ok":
            return data
    except Exception:
        pass
    return None


def fetch_actions(skill: str) -> list[str]:
    """Get action list — prefer hard-coded SKILL_ACTIONS, fallback to API."""
    if skill in SKILL_ACTIONS:
        return SKILL_ACTIONS[skill]
    try:
        url = f"{API_BASE}/api/v1/schema/actions/{skill}"
        resp = urllib.request.urlopen(url, timeout=5)
        data = json.loads(resp.read())
        return data.get("actions", [])
    except Exception:
        return []


# ── YAML Generator ────────────────────────────────────────────────────────────

def generate_ui_yaml(skill: str, schema: dict) -> str:
    """Generate UI.yaml content for a skill."""
    meta = SKILL_META.get(skill, {})
    tables = SKILL_TABLES.get(skill, [])

    # Classify into parent and child entities
    parents, children = classify_tables(tables, schema)

    # Fetch action data from API if available
    params_data = fetch_params(skill)
    all_actions = fetch_actions(skill)

    # Build action → entity mapping from action names
    action_entity_map = {}
    for action in all_actions:
        entity = action_to_entity(action, parents)
        if entity:
            action_entity_map[action] = entity

    lines = []
    w = lines.append  # shorthand

    # Header
    w(f'ocui_version: "1.0"')
    w(f'skill: {skill}')
    w(f'skill_version: "1.0.0"')
    w(f'display_name: {meta.get("display_name", skill.replace("erpclaw-", "").title())}')
    w(f'icon: {meta.get("icon", "box")}')
    w(f'color: "{meta.get("color", "#6366f1")}"')
    w("")

    # Entities
    if parents:
        w("entities:")
        for table in parents:
            cols = schema.get(table, [])
            if not cols:
                continue
            entity_key = table
            label = name_to_label(table).replace(" ", " ")
            label_plural = pluralize_label(label)

            # Detect key fields
            name_col = find_name_column(cols)
            status_col = find_status_column(cols)
            date_col = find_date_column(cols)

            w(f"  {entity_key}:")
            w(f"    label: {label}")
            w(f"    label_plural: {label_plural}")
            w(f"    table: {table}")
            w(f"    id_col: id")
            w(f"    name_col: {name_col or 'id'}")
            w(f"    primary_field: {name_col or 'id'}")
            w(f"    identifier_field: id")
            if status_col:
                w(f"    status_field: {status_col}")
                w(f"    status_colors:")
                for opt in infer_status_options(table):
                    color = status_color(opt["value"])
                    w(f'      {opt["value"]}: {color}')

            # Fields
            w(f"    fields:")
            form_order = 1
            field_groups = classify_fields(cols, table)

            for col in cols:
                field = infer_ui_field_type(col, table)
                fname = col["name"]

                # Skip auto-generated columns
                if fname in ("created_at", "updated_at", "modified_at"):
                    continue

                w(f"      {fname}:")
                w(f"        type: {field['type']}")
                w(f"        label: {field['label']}")

                if field.get("required"):
                    w(f"        required: true")
                if field.get("read_only"):
                    w(f"        read_only: true")
                if field.get("hidden"):
                    w(f"        hidden: true")
                if field.get("default") is not None:
                    w(f'        default: "{field["default"]}"')
                if field.get("precision"):
                    w(f"        precision: {field['precision']}")
                if field.get("options"):
                    w(f"        options:")
                    for opt in field["options"]:
                        w(f'          - value: "{opt["value"]}"')
                        w(f'            label: "{opt["label"]}"')

                # Link config
                if field["type"] == "link":
                    if field.get("link_entity"):
                        w(f"        link_entity: {field['link_entity']}")
                    if field.get("link_display_field"):
                        w(f"        link_display_field: {field['link_display_field']}")
                    if field.get("link_search_action"):
                        w(f"        link_search_action: {field['link_search_action']}")

                # View hints
                is_list_field = fname in (name_col, status_col, date_col) or \
                    col.get("pk") or field["type"] in ("date",) and "posting" in fname
                is_key_field = not field.get("read_only") and not field.get("hidden") and \
                    fname not in ("created_at", "updated_at", "modified_at", "id")

                if is_list_field and not field.get("hidden"):
                    w(f"        in_list_view: true")
                if is_key_field:
                    w(f"        in_form_view: true")
                    group = field_groups.get(fname, "details")
                    w(f"        form_group: {group}")
                    w(f"        form_order: {form_order}")
                    form_order += 1

            # Form groups
            groups = build_form_groups(cols, table, children, field_groups)
            if groups:
                w(f"    form_groups:")
                for gk, gv in groups.items():
                    w(f"      {gk}:")
                    w(f"        label: {gv['label']}")
                    w(f"        order: {gv['order']}")
                    if gv.get("columns"):
                        w(f"        columns: {gv['columns']}")
                    if gv.get("type"):
                        w(f"        type: {gv['type']}")

            w("")

    # Child entities
    if children:
        w("child_entities:")
        for child_table in children:
            cols = schema.get(child_table, [])
            if not cols:
                continue
            parent = find_parent_table(child_table, parents, schema)
            if not parent:
                continue

            w(f"  {child_table}:")
            w(f"    parent_entity: {parent}")
            # Find parent FK column
            parent_fk = None
            for col in cols:
                if col["fk_table"] == parent or col["name"] == f"{parent}_id":
                    parent_fk = col["name"]
                    break
            w(f"    parent_field: {parent_fk or parent + '_id'}")
            param = CHILD_PARAM_MAP.get(child_table, "items")
            w(f"    param_name: {param}")
            w(f"    fields:")

            for col in cols:
                field = infer_ui_field_type(col, child_table)
                fname = col["name"]
                if fname in ("created_at", "updated_at", "modified_at"):
                    continue
                # Skip parent FK in child table (not user-editable)
                if fname == parent_fk:
                    continue

                w(f"      {fname}:")
                w(f"        type: {field['type']}")
                w(f"        label: {field['label']}")
                if field.get("required"):
                    w(f"        required: true")
                if field.get("read_only"):
                    w(f"        read_only: true")
                if field.get("hidden"):
                    w(f"        hidden: true")
                if field.get("precision"):
                    w(f"        precision: {field['precision']}")
                if field.get("options"):
                    w(f"        options:")
                    for opt in field["options"]:
                        w(f'          - value: "{opt["value"]}"')
                        w(f'            label: "{opt["label"]}"')
                if field["type"] == "link":
                    if field.get("link_entity"):
                        w(f"        link_entity: {field['link_entity']}")
                    if field.get("link_display_field"):
                        w(f"        link_display_field: {field['link_display_field']}")
                    if field.get("link_search_action"):
                        w(f"        link_search_action: {field['link_search_action']}")

        w("")

    # Action map
    w("action_map:")
    for action in sorted(all_actions):
        atype = action_type(action)
        entity = action_entity_map.get(action)

        if atype == "list" and entity:
            w(f"  {action}:")
            w(f"    component: DataTable")
            w(f"    entity: {entity}")
            w(f"    default_sort: created_at")
            w(f"    default_sort_dir: desc")
            w(f"    searchable: true")
            # Find matching add action
            add_action = find_add_action(entity, all_actions)
            if add_action:
                w(f"    add_action: {add_action}")

        elif atype in ("add", "create") and entity:
            child_table = find_child_for_entity(entity, children, schema)
            w(f"  {action}:")
            w(f"    component: FormView")
            w(f"    entity: {entity}")
            w(f"    mode: create")
            if child_table:
                w(f"    child_tables:")
                w(f"      - entity: {child_table}")
                w(f"        form_group: items")
                w(f'        add_label: "Add Row"')

        elif atype == "update" and entity:
            w(f"  {action}:")
            w(f"    component: FormView")
            w(f"    entity: {entity}")
            w(f"    mode: edit")

        elif atype == "get" and entity:
            w(f"  {action}:")
            w(f"    component: DetailView")
            w(f"    entity: {entity}")

        elif atype == "submit" and entity:
            w(f"  {action}:")
            w(f"    component: WizardFlow")
            w(f"    entity: {entity}")
            w(f"    steps:")
            w(f"      - label: Review")
            w(f"        type: detail")
            w(f"      - label: Confirm")
            w(f"        type: confirmation")
            w(f'        message: "Submit this {name_to_label(entity).lower()}?"')

        elif atype == "cancel" and entity:
            w(f"  {action}:")
            w(f"    component: WizardFlow")
            w(f"    entity: {entity}")
            w(f"    steps:")
            w(f"      - label: Review")
            w(f"        type: detail")
            w(f"      - label: Confirm")
            w(f"        type: confirmation")
            w(f'        message: "Cancel this {name_to_label(entity).lower()}? This cannot be undone."')
            w(f"        destructive: true")

        elif atype == "delete" and entity:
            w(f"  {action}:")
            w(f"    component: null")
            w(f"    entity: {entity}")
            w(f"    hidden: true")

        elif action == "status":
            w(f"  status:")
            w(f"    component: DashboardView")

        else:
            # Generic action (generate, compute, seed, etc.)
            w(f"  {action}:")
            w(f"    component: FormView")
            if entity:
                w(f"    entity: {entity}")
            w(f"    mode: create")

    return "\n".join(lines) + "\n"


# ── Helper functions ──────────────────────────────────────────────────────────

def action_type(action: str) -> str:
    if action.startswith("list-"): return "list"
    if action.startswith("get-"): return "get"
    if action.startswith("add-"): return "add"
    if action.startswith("create-"): return "create"
    if action.startswith("update-"): return "update"
    if action.startswith("submit-"): return "submit"
    if action.startswith("cancel-"): return "cancel"
    if action.startswith("delete-"): return "delete"
    return "other"


def action_to_entity(action: str, parent_tables: list[str]) -> str | None:
    """Map an action name to its entity table."""
    # Strip verb prefix
    prefixes = ("list-", "get-", "add-", "create-", "update-", "submit-",
                "cancel-", "delete-", "generate-", "compute-", "seed-", "setup-")
    rest = action
    for p in prefixes:
        if action.startswith(p):
            rest = action[len(p):]
            break

    # Convert kebab to snake
    snake = rest.replace("-", "_")

    # Try singular forms
    candidates = [
        snake,
        snake.rstrip("s"),
        snake.replace("ies", "y") if snake.endswith("ies") else snake,
        snake.replace("ses", "s") if snake.endswith("ses") else snake,
        snake.replace("es", "") if snake.endswith("es") else snake,
        snake.replace("entries", "entry"),
        snake.replace("slips", "slip"),
    ]

    for c in candidates:
        if c in parent_tables:
            return c
    return None


def find_add_action(entity: str, actions: list[str]) -> str | None:
    """Find the add/create action for an entity."""
    kebab = entity.replace("_", "-")
    for prefix in ("add-", "create-"):
        candidate = f"{prefix}{kebab}"
        if candidate in actions:
            return candidate
    return None


def find_child_for_entity(entity: str, children: list[str], schema: dict) -> str | None:
    """Find a child table for an entity."""
    for child in children:
        parent = find_parent_table(child, [entity], schema)
        if parent == entity:
            return child
    return None


def find_name_column(cols: list[dict]) -> str | None:
    for col in cols:
        if col["name"] == "name":
            return "name"
    for col in cols:
        if "name" in col["name"] and col["name"] != "naming_series":
            return col["name"]
    for col in cols:
        if col["name"] == "title":
            return "title"
    return None


def find_status_column(cols: list[dict]) -> str | None:
    for col in cols:
        if col["name"] == "status":
            return "status"
        if col["name"] == "docstatus":
            return "docstatus"
    return None


def find_date_column(cols: list[dict]) -> str | None:
    for col in cols:
        if col["name"] in ("posting_date", "transaction_date", "order_date"):
            return col["name"]
    for col in cols:
        if col["name"].endswith("_date") and col["name"] not in ("due_date",):
            return col["name"]
    return None


def pluralize_label(label: str) -> str:
    if label.endswith("y") and not label.endswith("ey"):
        return label[:-1] + "ies"
    if label.endswith("s") or label.endswith("x") or label.endswith("ch"):
        return label + "es"
    return label + "s"


def status_color(status: str) -> str:
    colors = {
        "draft": "gray",
        "open": "blue",
        "new": "blue",
        "active": "green",
        "in_progress": "blue",
        "working": "blue",
        "contacted": "cyan",
        "qualified": "teal",
        "submitted": "green",
        "completed": "green",
        "resolved": "green",
        "won": "green",
        "converted": "green",
        "closed": "gray",
        "cancelled": "red",
        "lost": "red",
        "paused": "yellow",
        "past_due": "orange",
        "overdue": "orange",
        "quotation": "purple",
    }
    return colors.get(status, "gray")


def classify_fields(cols: list[dict], table: str) -> dict[str, str]:
    """Classify each column into a form group."""
    groups = {}
    for col in cols:
        name = col["name"]
        if name in ("id", "created_at", "updated_at", "modified_at", "naming_series"):
            continue

        if name.endswith("_id"):
            groups[name] = "references"
        elif name in ("status", "docstatus"):
            groups[name] = "header"
        elif "date" in name or name in ("posting_date", "due_date"):
            groups[name] = "header"
        elif "amount" in name or "total" in name or "rate" in name or "price" in name:
            groups[name] = "amounts"
        elif name in ("description", "remarks", "notes", "reason", "terms", "message"):
            groups[name] = "notes"
        elif name in ("name", "title", "company_id", "employee_id"):
            groups[name] = "header"
        else:
            groups[name] = "details"

    return groups


def build_form_groups(cols: list[dict], table: str, children: list[str],
                       field_groups: dict[str, str]) -> dict:
    """Build form group definitions."""
    used_groups = set(field_groups.values())
    groups = {}
    order = 1

    group_defs = {
        "header": {"label": "Basic Information", "columns": 2},
        "details": {"label": "Details", "columns": 2},
        "references": {"label": "References", "columns": 2},
        "amounts": {"label": "Amounts", "columns": 2},
        "notes": {"label": "Notes", "columns": 1},
    }

    for gk in ("header", "details", "references", "amounts", "notes"):
        if gk in used_groups:
            gdef = group_defs[gk]
            groups[gk] = {
                "label": gdef["label"],
                "order": order,
                "columns": gdef["columns"],
            }
            order += 1

    # Add child table group if applicable
    for child in children:
        parent = find_parent_table(child, [table], {table: cols})
        if parent == table:
            groups["items"] = {
                "label": "Line Items",
                "order": order,
                "type": "child_table",
            }
            order += 1
            break

    return groups


# ── Validation ────────────────────────────────────────────────────────────────

def validate_ui_yaml(skill: str, yaml_path: str) -> list[str]:
    """Validate a UI.yaml file for correctness. Returns list of issues."""
    import yaml as yaml_lib

    issues = []

    try:
        with open(yaml_path) as f:
            config = yaml_lib.safe_load(f)
    except Exception as e:
        return [f"Failed to parse YAML: {e}"]

    if not config:
        return ["Empty config"]

    # Check required top-level fields
    for field in ("ocui_version", "skill", "entities", "action_map"):
        if field not in config:
            issues.append(f"Missing top-level field: {field}")

    entities = config.get("entities", {})
    child_entities = config.get("child_entities", {})
    action_map = config.get("action_map", {})

    # Validate entities
    for ek, ev in entities.items():
        if not ev.get("label"):
            issues.append(f"Entity {ek}: missing label")
        if not ev.get("fields"):
            issues.append(f"Entity {ek}: no fields defined")

        # Check form_groups referenced by fields exist
        defined_groups = set(ev.get("form_groups", {}).keys())
        for fk, fv in ev.get("fields", {}).items():
            fg = fv.get("form_group")
            if fg and defined_groups and fg not in defined_groups:
                issues.append(f"Entity {ek}.{fk}: form_group '{fg}' not in defined groups {defined_groups}")

            # Check link fields have search action
            if fv.get("type") == "link" and not fv.get("link_search_action") and not fv.get("link_entity"):
                issues.append(f"Entity {ek}.{fk}: link field without search_action or link_entity")

    # Validate child entities
    for ck, cv in child_entities.items():
        parent = cv.get("parent_entity")
        if not parent:
            issues.append(f"Child {ck}: missing parent_entity")
        elif parent not in [e.get("table", ek) for ek, e in entities.items()] and parent not in entities:
            issues.append(f"Child {ck}: parent_entity '{parent}' not found in entities")

    # Validate action_map
    for ak, av in action_map.items():
        entity = av.get("entity")
        if entity and entity not in entities:
            issues.append(f"Action {ak}: entity '{entity}' not found in entities")

        component = av.get("component")
        if component == "FormView" and entity:
            # Check entity has form-capable fields
            ent = entities.get(entity, {})
            form_fields = [f for f, v in ent.get("fields", {}).items()
                          if v.get("in_form_view") and not v.get("read_only") and not v.get("hidden")]
            if not form_fields:
                issues.append(f"Action {ak}: entity '{entity}' has no form-view fields")

    return issues


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    # Parse init_db.py
    schema = parse_init_db(INIT_DB_PATH)
    print(f"Parsed {len(schema)} tables from init_db.py")

    if "--validate" in args:
        # Validate all existing UI.yaml files
        print("\n=== Validating UI.yaml files ===\n")
        total_issues = 0
        for skill_dir in sorted(os.listdir(SKILLS_REPO_ROOT)):
            if not skill_dir.startswith("erpclaw-"):
                continue
            yaml_path = os.path.join(SKILLS_REPO_ROOT, skill_dir, "UI.yaml")
            if not os.path.exists(yaml_path):
                continue
            issues = validate_ui_yaml(skill_dir, yaml_path)
            if issues:
                print(f"  {skill_dir}: {len(issues)} issues")
                for i in issues:
                    print(f"    - {i}")
                total_issues += len(issues)
            else:
                print(f"  {skill_dir}: OK")
        print(f"\nTotal issues: {total_issues}")
        return

    # Determine which skills to generate for
    if args:
        skills = [a for a in args if not a.startswith("--")]
    else:
        skills = [s for s in SKILL_TABLES.keys() if s not in SKIP_SKILLS]

    for skill in skills:
        if skill in SKIP_SKILLS:
            print(f"Skipping {skill} (has hand-crafted UI.yaml)")
            continue

        print(f"\nGenerating UI.yaml for {skill}...")
        yaml_content = generate_ui_yaml(skill, schema)

        # Write to skill repo
        output_path = os.path.join(SKILLS_REPO_ROOT, skill, "UI.yaml")
        with open(output_path, "w") as f:
            f.write(yaml_content)
        print(f"  Written to {output_path} ({len(yaml_content)} bytes)")

    print(f"\nDone! Generated UI.yaml for {len(skills)} skills.")


if __name__ == "__main__":
    main()
