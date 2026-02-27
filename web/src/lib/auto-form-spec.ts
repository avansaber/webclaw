// ── Auto Form Spec Generator ────────────────────────────────────────────────
// Converts SKILL.md parameter metadata (from /api/v1/schema/params/) into
// FormSpec objects that DynamicForm can render. This enables zero-config
// form generation for ANY OpenClaw skill.

import type { FormSpec, FormSectionSpec, FormFieldSpec, FieldType } from "./form-spec";
import type { ActionParamSchema, ParamField, ParamSchema } from "./param-schema";
import type { ChildTableSchema } from "./child-table-schema";

// ── Title derivation ────────────────────────────────────────────────────────

const ACTION_PREFIXES: Record<string, string> = {
  "add-": "New ",
  "create-": "New ",
  "update-": "Update ",
  "submit-": "Submit ",
  "cancel-": "Cancel ",
  "delete-": "Delete ",
  "confirm-": "Confirm ",
  "complete-": "Complete ",
  "approve-": "Approve ",
  "reject-": "Reject ",
  "check-": "Check ",
  "get-": "",
  "list-": "",
  "seed-": "Setup ",
  "setup-": "Setup ",
  "generate-": "Generate ",
  "compute-": "Compute ",
  "validate-": "Validate ",
};

function kebabToTitle(kebab: string): string {
  return kebab
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function deriveTitle(action: string): string {
  for (const [prefix, label] of Object.entries(ACTION_PREFIXES)) {
    if (action.startsWith(prefix)) {
      const entity = action.slice(prefix.length);
      return `${label}${kebabToTitle(entity)}`.trim();
    }
  }
  return kebabToTitle(action);
}

function deriveSubmitLabel(action: string): string {
  if (action.startsWith("add-") || action.startsWith("create-")) return "Create";
  if (action.startsWith("update-")) return "Update";
  if (action.startsWith("submit-")) return "Submit";
  if (action.startsWith("cancel-")) return "Cancel";
  if (action.startsWith("delete-")) return "Delete";
  if (action.startsWith("confirm-")) return "Confirm";
  if (action.startsWith("complete-")) return "Complete";
  if (action.startsWith("approve-")) return "Approve";
  if (action.startsWith("reject-")) return "Reject";
  if (action.startsWith("check-")) return "Check";
  if (action.startsWith("generate-")) return "Generate";
  if (action.startsWith("compute-")) return "Compute";
  if (action.startsWith("seed-") || action.startsWith("setup-")) return "Run Setup";
  return "Execute";
}

function deriveEntity(action: string): string {
  for (const prefix of Object.keys(ACTION_PREFIXES)) {
    if (action.startsWith(prefix)) {
      return action.slice(prefix.length).replace(/-/g, "_");
    }
  }
  return action.replace(/-/g, "_");
}

// ── Field type mapping ──────────────────────────────────────────────────────

const PARAM_TYPE_TO_FIELD_TYPE: Record<string, FieldType> = {
  text: "text",
  number: "number",
  currency: "currency",
  date: "date",
  time: "text", // Render as text with HH:MM placeholder
  textarea: "textarea",
  select: "select",
  "entity-lookup": "entity-lookup",
  boolean: "boolean",
  email: "text",
  phone: "text",
};

// Fields that should auto-hide (injected by gateway or not user-facing)
const AUTO_HIDDEN_FIELDS = new Set(["company-id"]);

function paramToField(param: ParamField, skill: string): FormFieldSpec {
  const fieldType: FieldType = PARAM_TYPE_TO_FIELD_TYPE[param.type] || "text";

  const field: FormFieldSpec = {
    key: param.name,
    label: param.label,
    type: fieldType,
    required: param.required,
  };

  // Propagate description for tooltips
  if (param.description) {
    field.description = param.description;
  }

  // Default value
  if (param.default !== undefined) {
    field.default = param.default;
  }

  // Placeholder
  if (fieldType === "date") {
    field.placeholder = "YYYY-MM-DD";
  } else if (param.type === "time") {
    field.placeholder = "HH:MM";
  } else if (param.type === "email") {
    field.placeholder = "email@example.com";
  } else if (param.type === "phone") {
    field.placeholder = "+1 (555) 000-0000";
  } else if (fieldType === "entity-lookup") {
    field.placeholder = `Search ${param.label.toLowerCase()}...`;
  } else if (fieldType === "currency") {
    field.placeholder = "0.00";
    field.min = 0;
    field.step = 0.01;
  } else if (fieldType === "number") {
    field.step = param.step ?? 1;
  }

  // Select options
  if (param.options && param.options.length > 0) {
    field.options = param.options;
  }

  // Entity lookup
  if (fieldType === "entity-lookup" && param.lookup_action) {
    field.entity_action = param.lookup_action;
    field.entity_value_field = "id";
    // Derive display field from entity name
    const entityName = param.name.replace(/-id$/, "");
    field.entity_display_field = entityName.includes("account")
      ? "account_name"
      : entityName.includes("employee")
        ? "employee_name"
        : "name";
    if (param.lookup_skill && param.lookup_skill !== skill) {
      field.entity_skill = param.lookup_skill;
    }
  }

  return field;
}

// ── Main generator ──────────────────────────────────────────────────────────

export function generateAutoFormSpec(
  skill: string,
  action: string,
  paramSchema: ActionParamSchema,
  childTableSchema?: ChildTableSchema
): FormSpec | null {
  // Only generate forms for create/update/transition actions (not list/get)
  const formActions = ["create", "update", "setup", "action", "status-transition", "utility"];
  if (!formActions.includes(paramSchema.action_type)) {
    return null;
  }

  // Need at least one field
  const allParams = [...paramSchema.required, ...paramSchema.optional];
  if (allParams.length === 0) return null;

  const sections: FormSectionSpec[] = [];

  // Split fields into regular fields and JSON fields
  const regularRequired = paramSchema.required.filter(
    (p) => p.type !== "json" && !AUTO_HIDDEN_FIELDS.has(p.name)
  );
  const regularOptional = paramSchema.optional.filter(
    (p) => p.type !== "json" && !AUTO_HIDDEN_FIELDS.has(p.name)
  );
  const jsonFields = allParams.filter((p) => p.type === "json");
  const hiddenRequired = paramSchema.required.filter((p) =>
    AUTO_HIDDEN_FIELDS.has(p.name)
  );

  // Section 1: Required fields
  if (regularRequired.length > 0) {
    sections.push({
      label: paramSchema.entity_group || deriveTitle(action),
      columns: regularRequired.length > 1 ? 2 : 1,
      fields: regularRequired.map((p) => paramToField(p, skill)),
    });
  }

  // Section 2: Optional fields (if any)
  if (regularOptional.length > 0) {
    sections.push({
      label: "Additional Details",
      columns: regularOptional.length > 1 ? 2 : 1,
      fields: regularOptional.map((p) => paramToField(p, skill)),
    });
  }

  // Section 3: JSON fields — render as repeatable rows if child table matches,
  // otherwise fall back to textarea
  const entity = deriveEntity(action);
  const childTables = childTableSchema?.child_tables?.[entity];

  for (const jsonParam of jsonFields) {
    const matchedChild = childTables?.find(
      (ct) => ct.param_name === jsonParam.name
    );

    if (matchedChild && matchedChild.fields.length > 0) {
      // Render as repeatable section with proper typed fields
      sections.push({
        label: jsonParam.label,
        type: "repeatable",
        key: jsonParam.name,
        min_rows: 1,
        fields: matchedChild.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: (f.type || "text") as FieldType,
          required: f.required,
          default: f.default,
          step: f.step,
          min: f.min,
          placeholder:
            f.type === "entity-lookup"
              ? `Search ${f.label.toLowerCase()}...`
              : f.type === "currency"
                ? "0.00"
                : undefined,
          entity_action: f.entity_action,
          entity_skill: f.entity_skill,
          entity_value_field: f.entity_value_field,
          entity_display_field: f.entity_display_field,
        })),
      });
    } else {
      // Fallback: render as textarea
      sections.push({
        label: jsonParam.label,
        columns: 1,
        fields: [
          {
            key: jsonParam.name,
            label: jsonParam.label,
            type: "textarea",
            required: jsonParam.required,
            placeholder: `Enter ${jsonParam.label.toLowerCase()} as JSON array...`,
            helpText: "JSON format: [{...}, {...}]",
          },
        ],
      });
    }
  }

  // Add hidden company-id as a hidden required field if needed
  // (gateway auto-injects it, but we include for completeness)
  if (hiddenRequired.length > 0 && sections.length > 0) {
    for (const hp of hiddenRequired) {
      sections[0].fields.unshift({
        ...paramToField(hp, skill),
        // Will be auto-injected by gateway, but user can override
      });
    }
  }

  return {
    title: deriveTitle(action),
    submit_action: action,
    submit_label: deriveSubmitLabel(action),
    sections,
  };
}

// ── Helpers for skill page ──────────────────────────────────────────────────

/** Get all actions that should show as form buttons (add-*, create-*, update-*) */
export function getFormActions(schema: ParamSchema): string[] {
  return Object.entries(schema.actions)
    .filter(([, v]) => ["create", "update"].includes(v.action_type))
    .map(([k]) => k);
}

/** Get the primary create action for an entity group */
export function getGroupCreateAction(
  schema: ParamSchema,
  groupName: string
): string | null {
  const group = schema.entity_groups.find((g) => g.name === groupName);
  if (!group) return null;
  return (
    group.actions.find((a) => a.startsWith("add-") || a.startsWith("create-")) ||
    null
  );
}

/** Get the list action for an entity group */
export function getGroupListAction(
  schema: ParamSchema,
  groupName: string
): string | null {
  const group = schema.entity_groups.find((g) => g.name === groupName);
  if (!group) return null;
  return group.actions.find((a) => a.startsWith("list-")) || null;
}
