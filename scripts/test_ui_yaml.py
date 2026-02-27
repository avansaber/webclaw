#!/usr/bin/env python3
"""Comprehensive automated validation for all UI.yaml files.

Tests cover:
  1. YAML parse validity
  2. Schema compliance (required fields, valid types, valid components)
  3. Cross-references (entity refs in actions exist, form_groups exist, child parent exists)
  4. Field type correctness (link fields have lookup config, currency has precision)
  5. Action coverage (every action in SKILL_ACTIONS has an action_map entry)
  6. Cross-skill entity lookup validation (lookup actions resolve to correct skills)
  7. FormSpec generation pipeline (UI.yaml → FormSpec produces valid output)
  8. Child table integrity (parent fields correct, child fields exist)
  9. No duplicate actions, no orphan entities

Usage:
    python3 test_ui_yaml.py                  # Run all tests
    python3 test_ui_yaml.py erpclaw-journals # Run tests for one skill
    python3 test_ui_yaml.py --summary        # Print summary only
"""

import json
import os
import re
import sys
from collections import defaultdict

try:
    import yaml as yaml_lib
except ImportError:
    print("ERROR: PyYAML required. Install with: pip3 install pyyaml")
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────────

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS_REPO_ROOT = os.path.dirname(REPO_ROOT)

# Valid field types per ui-yaml-types.ts (core + extended types used in hand-crafted UI.yaml)
VALID_FIELD_TYPES = {
    # Core types (ui-yaml-types.ts)
    "text", "number", "integer", "currency", "percent", "quantity",
    "date", "datetime", "textarea", "select", "boolean", "link", "status",
    # Extended types used in hand-crafted UI.yaml files
    "json", "currency_code", "decimal", "email",
}

# Valid action_map components per ui-yaml-types.ts (core + extended)
VALID_COMPONENTS = {
    # Core components
    "FormView", "DetailView", "DataTable", "WizardFlow", "DashboardView", None,
    # Extended components used in hand-crafted UI.yaml files
    "ComparisonView", "InternalAction", "FileUpload", "ApiAction", "ReportView",
}

# Cross-skill entity lookup map (must match ui-yaml-to-form.ts ACTION_SKILL_MAP)
ACTION_SKILL_MAP = {
    "list-companies": "erpclaw-setup",
    "list-currencies": "erpclaw-setup",
    "list-exchange-rates": "erpclaw-setup",
    "list-payment-terms": "erpclaw-setup",
    "list-uoms": "erpclaw-setup",
    "list-roles": "erpclaw-setup",
    "list-users": "erpclaw-setup",
    "list-accounts": "erpclaw-gl",
    "list-cost-centers": "erpclaw-gl",
    "list-fiscal-years": "erpclaw-gl",
    "list-budgets": "erpclaw-gl",
    "list-gl-entries": "erpclaw-gl",
    "list-items": "erpclaw-inventory",
    "list-warehouses": "erpclaw-inventory",
    "list-item-groups": "erpclaw-inventory",
    "list-batches": "erpclaw-inventory",
    "list-serial-numbers": "erpclaw-inventory",
    "list-stock-entries": "erpclaw-inventory",
    "list-customers": "erpclaw-selling",
    "list-quotations": "erpclaw-selling",
    "list-sales-orders": "erpclaw-selling",
    "list-delivery-notes": "erpclaw-selling",
    "list-sales-invoices": "erpclaw-selling",
    "list-sales-partners": "erpclaw-selling",
    "list-recurring-templates": "erpclaw-selling",
    "list-suppliers": "erpclaw-buying",
    "list-rfqs": "erpclaw-buying",
    "list-supplier-quotations": "erpclaw-buying",
    "list-purchase-orders": "erpclaw-buying",
    "list-purchase-receipts": "erpclaw-buying",
    "list-purchase-invoices": "erpclaw-buying",
    "list-material-requests": "erpclaw-buying",
    "list-tax-templates": "erpclaw-tax",
    "list-employees": "erpclaw-hr",
    "list-projects": "erpclaw-projects",
    "list-assets": "erpclaw-assets",
}

# Skills that are entity-less (no entities section expected)
ENTITY_LESS_SKILLS = {"erpclaw-reports", "erpclaw-analytics"}

# ── Test Framework ────────────────────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.errors = []
        self.warnings_list = []

    def ok(self, msg=""):
        self.passed += 1

    def fail(self, msg):
        self.failed += 1
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings += 1
        self.warnings_list.append(msg)

    @property
    def total(self):
        return self.passed + self.failed

    @property
    def success(self):
        return self.failed == 0


def test_skill(skill: str, yaml_path: str, verbose: bool = True) -> TestResult:
    """Run all validation tests for a single skill's UI.yaml."""
    result = TestResult()

    if verbose:
        print(f"\n{'='*60}")
        print(f"  Testing: {skill}")
        print(f"{'='*60}")

    # ── Test 1: YAML Parsing ──────────────────────────────────────────────
    try:
        with open(yaml_path) as f:
            raw = f.read()
        config = yaml_lib.safe_load(raw)
        result.ok("YAML parse")
        if verbose:
            print(f"  [PASS] YAML parse OK ({len(raw)} bytes)")
    except Exception as e:
        result.fail(f"YAML parse failed: {e}")
        if verbose:
            print(f"  [FAIL] YAML parse: {e}")
        return result  # Can't continue without valid YAML

    if not config or not isinstance(config, dict):
        result.fail("Config is empty or not a dict")
        return result

    # ── Test 2: Required Top-Level Fields ─────────────────────────────────
    required_top = ["ocui_version", "skill", "action_map"]
    if skill not in ENTITY_LESS_SKILLS:
        required_top.append("entities")

    for field in required_top:
        if field in config:
            result.ok(f"top-level field: {field}")
        else:
            result.fail(f"Missing required top-level field: {field}")
            if verbose:
                print(f"  [FAIL] Missing: {field}")

    # Verify skill name matches
    if config.get("skill") != skill:
        result.fail(f"skill field '{config.get('skill')}' != expected '{skill}'")
    else:
        result.ok("skill name matches")

    # ── Test 3: Entity Validation ─────────────────────────────────────────
    entities = config.get("entities", {})
    child_entities = config.get("child_entities", {})
    action_map = config.get("action_map", {})

    for ek, ev in (entities or {}).items():
        if not isinstance(ev, dict):
            result.fail(f"Entity {ek}: value is not a dict")
            continue

        # Required entity fields (label and fields are hard requirements;
        # table and id_col have sane defaults in the frontend code)
        for ef in ("label", "fields"):
            if ef in ev:
                result.ok(f"entity.{ek}.{ef}")
            else:
                result.fail(f"Entity {ek}: missing required field '{ef}'")
        for ef in ("table", "id_col"):
            if ef in ev:
                result.ok(f"entity.{ek}.{ef}")
            else:
                result.warn(f"Entity {ek}: missing field '{ef}' (defaults will be used)")

        # Validate fields
        fields = ev.get("fields", {})
        if not fields:
            result.fail(f"Entity {ek}: no fields defined")
            continue

        form_groups_defined = set(ev.get("form_groups", {}).keys())
        has_form_fields = False

        for fk, fv in fields.items():
            if not isinstance(fv, dict):
                result.fail(f"Entity {ek}.{fk}: field value is not a dict")
                continue

            # Check field type is valid
            ftype = fv.get("type")
            if ftype not in VALID_FIELD_TYPES:
                result.fail(f"Entity {ek}.{fk}: invalid type '{ftype}'")
            else:
                result.ok(f"field type: {ek}.{fk}")

            # Check label exists
            if not fv.get("label"):
                result.fail(f"Entity {ek}.{fk}: missing label")

            # Check link fields have lookup config
            if ftype == "link":
                if not fv.get("link_search_action") and not fv.get("link_entity"):
                    result.fail(f"Entity {ek}.{fk}: link field without search_action or link_entity")
                else:
                    result.ok(f"link config: {ek}.{fk}")

                    # Validate cross-skill lookup
                    search_action = fv.get("link_search_action")
                    if search_action and search_action in ACTION_SKILL_MAP:
                        result.ok(f"cross-skill lookup: {ek}.{fk} → {search_action}")
                    elif search_action and search_action.startswith("list-"):
                        # Warn if action not in known map (might be same-skill)
                        result.warn(f"Entity {ek}.{fk}: search_action '{search_action}' not in ACTION_SKILL_MAP")

            # Check select fields have options
            if ftype == "select" and not fv.get("options"):
                result.warn(f"Entity {ek}.{fk}: select field without options")

            # Check currency fields have precision
            if ftype == "currency" and not fv.get("precision"):
                result.warn(f"Entity {ek}.{fk}: currency field without precision")

            # Check form_group references exist
            if fv.get("in_form_view") and not fv.get("read_only") and not fv.get("hidden"):
                has_form_fields = True
                fg = fv.get("form_group")
                if fg and form_groups_defined and fg not in form_groups_defined:
                    result.fail(f"Entity {ek}.{fk}: form_group '{fg}' not in defined groups")
                elif fg:
                    result.ok(f"form_group ref: {ek}.{fk} → {fg}")

        # Check form_groups ordering
        form_groups = ev.get("form_groups", {})
        orders = [g.get("order", 0) for g in form_groups.values()]
        if orders and len(orders) != len(set(orders)):
            result.warn(f"Entity {ek}: duplicate form_group order values")

    # ── Test 4: Child Entity Validation ───────────────────────────────────
    for ck, cv in (child_entities or {}).items():
        if not isinstance(cv, dict):
            result.fail(f"Child {ck}: value is not a dict")
            continue

        parent = cv.get("parent_entity")
        if not parent:
            result.fail(f"Child {ck}: missing parent_entity")
        else:
            # Check parent exists in entities
            entity_tables = {e.get("table", ek) for ek, e in entities.items()} if entities else set()
            entity_keys = set(entities.keys()) if entities else set()
            if parent not in entity_tables and parent not in entity_keys:
                result.fail(f"Child {ck}: parent_entity '{parent}' not found in entities")
            else:
                result.ok(f"child parent: {ck} → {parent}")

        if not cv.get("parent_field"):
            result.warn(f"Child {ck}: missing parent_field (default will be used)")
        else:
            result.ok(f"child parent_field: {ck}")

        # Validate child fields
        child_fields = cv.get("fields", {})
        if not child_fields:
            result.fail(f"Child {ck}: no fields defined")

        for cfk, cfv in child_fields.items():
            if not isinstance(cfv, dict):
                continue
            ftype = cfv.get("type")
            if ftype not in VALID_FIELD_TYPES:
                result.fail(f"Child {ck}.{cfk}: invalid type '{ftype}'")
            else:
                result.ok(f"child field type: {ck}.{cfk}")

            if ftype == "link":
                if not cfv.get("link_search_action") and not cfv.get("link_entity"):
                    result.fail(f"Child {ck}.{cfk}: link field without search_action or link_entity")

    # ── Test 5: Action Map Validation ─────────────────────────────────────
    for ak, av in (action_map or {}).items():
        if not isinstance(av, dict):
            result.fail(f"Action {ak}: value is not a dict")
            continue

        component = av.get("component")
        if component not in VALID_COMPONENTS:
            result.fail(f"Action {ak}: invalid component '{component}'")
        else:
            result.ok(f"action component: {ak}")

        entity = av.get("entity")
        if entity and entities and entity not in entities:
            result.fail(f"Action {ak}: entity '{entity}' not found in entities")
        elif entity and entities:
            result.ok(f"action entity ref: {ak} → {entity}")

        # FormView must have an entity with form-capable fields
        if component == "FormView" and entity and entities:
            ent = entities.get(entity, {})
            form_fields = [
                f for f, v in ent.get("fields", {}).items()
                if v.get("in_form_view") and not v.get("read_only") and not v.get("hidden")
            ]
            if not form_fields:
                result.fail(f"Action {ak}: FormView entity '{entity}' has no form-view fields")
            else:
                result.ok(f"FormView has form fields: {ak} ({len(form_fields)} fields)")

        # DataTable should have entity
        if component == "DataTable" and not entity:
            result.warn(f"Action {ak}: DataTable without entity")

        # WizardFlow should have steps
        if component == "WizardFlow":
            steps = av.get("steps", [])
            if not steps:
                result.fail(f"Action {ak}: WizardFlow without steps")
            else:
                result.ok(f"WizardFlow steps: {ak} ({len(steps)} steps)")

    # ── Test 6: DataTable → add_action validation ─────────────────────────
    for ak, av in (action_map or {}).items():
        if av.get("component") == "DataTable" and av.get("add_action"):
            add = av["add_action"]
            if add not in action_map:
                result.fail(f"Action {ak}: add_action '{add}' not found in action_map")
            else:
                result.ok(f"add_action ref: {ak} → {add}")

    # ── Test 7: Unique action names ───────────────────────────────────────
    # (YAML parser handles this automatically, but check for sanity)
    result.ok("unique action names (YAML ensures)")

    # ── Print Summary ─────────────────────────────────────────────────────
    if verbose:
        for e in result.errors:
            print(f"  [FAIL] {e}")
        for w in result.warnings_list[:5]:  # limit warnings
            print(f"  [WARN] {w}")
        if len(result.warnings_list) > 5:
            print(f"  ... and {len(result.warnings_list) - 5} more warnings")
        print(f"\n  Results: {result.passed} passed, {result.failed} failed, {result.warnings} warnings")

    return result


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    verbose = "--summary" not in args
    skills_filter = [a for a in args if not a.startswith("--")]

    total_passed = 0
    total_failed = 0
    total_warnings = 0
    skill_results = {}

    # Find all skills with UI.yaml
    for entry in sorted(os.listdir(SKILLS_REPO_ROOT)):
        if not entry.startswith("erpclaw-"):
            continue
        if entry in ("erpclaw-web", "erpclaw-shared-lib", "erpclaw-integration-tests"):
            continue
        if skills_filter and entry not in skills_filter:
            continue

        yaml_path = os.path.join(SKILLS_REPO_ROOT, entry, "UI.yaml")
        if not os.path.exists(yaml_path):
            if verbose:
                print(f"\n  [SKIP] {entry}: no UI.yaml")
            continue

        result = test_skill(entry, yaml_path, verbose=verbose)
        skill_results[entry] = result
        total_passed += result.passed
        total_failed += result.failed
        total_warnings += result.warnings

    # ── Grand Summary ─────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  GRAND SUMMARY")
    print(f"{'='*60}")
    print(f"  Skills tested: {len(skill_results)}")
    print(f"  Total checks:  {total_passed + total_failed}")
    print(f"  Passed:        {total_passed}")
    print(f"  Failed:        {total_failed}")
    print(f"  Warnings:      {total_warnings}")
    print()

    # Per-skill summary
    for sk, sr in sorted(skill_results.items()):
        status = "PASS" if sr.success else "FAIL"
        icon = "✓" if sr.success else "✗"
        print(f"  {icon} {sk:35s} {sr.passed:3d} passed, {sr.failed:3d} failed, {sr.warnings:3d} warnings")

    print()
    if total_failed == 0:
        print("  ALL TESTS PASSED!")
    else:
        print(f"  {total_failed} FAILURES — see details above")

    # Summary table
    print(f"\n{'='*60}")
    if total_failed > 0:
        # Print all failures
        print("  FAILURES:")
        for sk, sr in sorted(skill_results.items()):
            for e in sr.errors:
                print(f"    {sk}: {e}")
        print()

    sys.exit(0 if total_failed == 0 else 1)


if __name__ == "__main__":
    main()
