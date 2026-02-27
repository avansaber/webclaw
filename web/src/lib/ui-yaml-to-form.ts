// ── UI.yaml → FormSpec Converter ─────────────────────────────────────────────
// Converts UI.yaml entity definitions into FormSpec objects that <DynamicForm>
// can render. This replaces the need for hand-crafted DEMO_FORM_SPECS.

import type {
  UIConfig,
  EntityDef,
  FieldDef,
  ActionMapEntry,
  ChildEntityDef,
} from "./ui-yaml-types";
import type { FormSpec, FormSectionSpec, FormFieldSpec, FieldType } from "./form-spec";

// Map UI.yaml field types to FormSpec field types
function mapFieldType(uiType: string): FieldType {
  switch (uiType) {
    case "link":
      return "entity-lookup";
    case "currency":
      return "currency";
    case "number":
    case "integer":
    case "quantity":
    case "percent":
      return "number";
    case "date":
    case "datetime":
      return "date";
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    case "boolean":
      return "boolean";
    default:
      return "text";
  }
}

// ── Cross-skill entity resolution ────────────────────────────────────────────
// Maps list actions to the skill that owns the entity. This enables entity
// lookups across skills (e.g. item_id in a sales invoice → erpclaw-inventory).

const ACTION_SKILL_MAP: Record<string, string> = {
  // erpclaw-setup
  "list-companies": "erpclaw-setup",
  "list-currencies": "erpclaw-setup",
  "list-exchange-rates": "erpclaw-setup",
  "list-payment-terms": "erpclaw-setup",
  "list-uoms": "erpclaw-setup",
  "list-roles": "erpclaw-setup",
  "list-users": "erpclaw-setup",
  // erpclaw-gl
  "list-accounts": "erpclaw-gl",
  "list-cost-centers": "erpclaw-gl",
  "list-fiscal-years": "erpclaw-gl",
  "list-budgets": "erpclaw-gl",
  "list-gl-entries": "erpclaw-gl",
  // erpclaw-inventory
  "list-items": "erpclaw-inventory",
  "list-warehouses": "erpclaw-inventory",
  "list-item-groups": "erpclaw-inventory",
  "list-batches": "erpclaw-inventory",
  "list-serial-numbers": "erpclaw-inventory",
  "list-stock-entries": "erpclaw-inventory",
  // erpclaw-selling
  "list-customers": "erpclaw-selling",
  "list-quotations": "erpclaw-selling",
  "list-sales-orders": "erpclaw-selling",
  "list-delivery-notes": "erpclaw-selling",
  "list-sales-invoices": "erpclaw-selling",
  "list-sales-partners": "erpclaw-selling",
  "list-recurring-templates": "erpclaw-selling",
  // erpclaw-buying
  "list-suppliers": "erpclaw-buying",
  "list-rfqs": "erpclaw-buying",
  "list-supplier-quotations": "erpclaw-buying",
  "list-purchase-orders": "erpclaw-buying",
  "list-purchase-receipts": "erpclaw-buying",
  "list-purchase-invoices": "erpclaw-buying",
  "list-material-requests": "erpclaw-buying",
  // erpclaw-tax
  "list-tax-templates": "erpclaw-tax",
  // erpclaw-hr
  "list-employees": "erpclaw-hr",
  // erpclaw-projects
  "list-projects": "erpclaw-projects",
  // erpclaw-assets
  "list-assets": "erpclaw-assets",
};

function resolveEntitySkill(searchAction: string): string | undefined {
  return ACTION_SKILL_MAP[searchAction];
}

// Special entity-to-action mappings for non-standard pluralization
const ENTITY_ACTION_OVERRIDES: Record<string, string> = {
  "request_for_quotation": "list-rfqs",
  "delivery_note": "list-delivery-notes",
  "stock_entry": "list-stock-entries",
  "gl_entry": "list-gl-entries",
  "serial_number": "list-serial-numbers",
};

function inferSearchAction(linkEntity: string | undefined): string | undefined {
  if (!linkEntity) return undefined;
  // Check overrides first
  if (ENTITY_ACTION_OVERRIDES[linkEntity]) return ENTITY_ACTION_OVERRIDES[linkEntity];
  // entity name → list action: "item" → "list-items", "warehouse" → "list-warehouses"
  const kebab = linkEntity.replace(/_/g, "-");
  const plural = kebab.endsWith("s") ? kebab
    : kebab.endsWith("y") ? kebab.slice(0, -1) + "ies"
    : kebab + "s";
  return `list-${plural}`;
}

// Convert a single field definition to a FormFieldSpec
function fieldDefToFormField(
  key: string,
  field: FieldDef,
  currentSkill: string
): FormFieldSpec {
  const spec: FormFieldSpec = {
    key: field.param_name || key.replace(/_/g, "-"), // Convert snake_case to kebab-case for CLI args
    label: field.label,
    type: mapFieldType(field.type),
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.help_text,
  };

  if (field.default !== undefined) spec.default = field.default;
  if (field.min !== undefined) spec.min = Number(field.min);
  if (field.max !== undefined) spec.max = Number(field.max);
  if (field.precision !== undefined) spec.step = Math.pow(10, -field.precision);

  // Select options
  if (field.options) {
    spec.options = field.options;
  }

  // Link (entity-lookup) config
  if (field.type === "link") {
    // Derive search action from link_entity if not explicit
    const searchAction = field.link_search_action || inferSearchAction(field.link_entity);
    if (searchAction) {
      spec.entity_action = searchAction;
      spec.entity_value_field = "id";
      spec.entity_display_field = field.link_display_field || "name";
      // Resolve cross-skill entity lookups
      const ownerSkill = resolveEntitySkill(searchAction);
      if (ownerSkill && ownerSkill !== currentSkill) {
        spec.entity_skill = ownerSkill;
      }
    }
  }

  return spec;
}

// Build form sections from entity fields + form_groups
function buildFormSections(
  entity: EntityDef,
  skill: string,
  childEntities?: Record<string, ChildEntityDef>,
  entityKey?: string
): FormSectionSpec[] {
  const sections: FormSectionSpec[] = [];
  const formGroups = entity.form_groups || {};

  // Collect form fields grouped by form_group
  const groupedFields: Record<string, { field: FieldDef; key: string; order: number }[]> = {};

  for (const [key, field] of Object.entries(entity.fields)) {
    if (!field.in_form_view) continue;
    if (field.read_only || field.hidden) continue;
    const group = field.form_group || "_default";
    if (!groupedFields[group]) groupedFields[group] = [];
    groupedFields[group].push({ field, key, order: field.form_order || 99 });
  }

  // Sort groups by their defined order
  const sortedGroups = Object.entries(formGroups)
    .sort(([, a], [, b]) => a.order - b.order);

  const resolvedEntityKey = entityKey || findEntityKey(entity);

  for (const [groupKey, groupDef] of sortedGroups) {
    if (groupDef.type === "child_table") {
      // Try to find child entity by matching parent_entity
      const matchedChild = Object.entries(childEntities || {}).find(
        ([, cd]) => cd.parent_entity === resolvedEntityKey
      );

      if (matchedChild) {
        const [, childDef] = matchedChild;
        const childFields = Object.entries(childDef.fields)
          .filter(([, f]) => !f.read_only && !f.hidden)
          .map(([k, f]) => fieldDefToFormField(k, f, skill));

        sections.push({
          label: groupDef.label,
          type: "repeatable",
          key: childDef.param_name || "items",
          min_rows: 1,
          fields: childFields,
        });
      }
      continue;
    }

    // Auto-detect: JSON field in group + matching child_entity = implicit child_table
    const groupFields = groupedFields[groupKey];
    if (groupFields && childEntities) {
      const jsonField = groupFields.find((f) => f.field.type === "json");
      if (jsonField) {
        const matchedChild = Object.entries(childEntities).find(
          ([, cd]) => cd.parent_entity === resolvedEntityKey
        );
        if (matchedChild) {
          const [, childDef] = matchedChild;
          const childFields = Object.entries(childDef.fields)
            .filter(([, f]) => !f.read_only && !f.hidden)
            .map(([k, f]) => fieldDefToFormField(k, f, skill));
          sections.push({
            label: groupDef.label,
            type: "repeatable",
            key: childDef.param_name || jsonField.key,
            min_rows: 1,
            fields: childFields,
          });
          continue;
        }
      }
    }

    const fields = groupedFields[groupKey];
    if (!fields || fields.length === 0) continue;

    fields.sort((a, b) => a.order - b.order);

    sections.push({
      label: groupDef.label,
      columns: (groupDef.columns || 1) as 1 | 2,
      fields: fields.map((f) => fieldDefToFormField(f.key, f.field, skill)),
    });
  }

  // If there are ungrouped fields, add them as a default section
  const defaultFields = groupedFields["_default"];
  if (defaultFields && defaultFields.length > 0) {
    defaultFields.sort((a, b) => a.order - b.order);
    sections.push({
      label: "Details",
      columns: 2,
      fields: defaultFields.map((f) => fieldDefToFormField(f.key, f.field, skill)),
    });
  }

  return sections;
}

// Try to determine the entity key from entity definition
function findEntityKey(entity: EntityDef): string {
  return entity.table || "";
}

// Generate a FormSpec for a given action from UI.yaml config
export function generateFormSpec(
  config: UIConfig,
  action: string
): FormSpec | null {
  const actionEntry = config.action_map?.[action];
  if (!actionEntry) return null;
  if (actionEntry.component !== "FormView") return null;
  if (!actionEntry.entity) return null;

  const entity = config.entities?.[actionEntry.entity];
  if (!entity) return null;

  // Check if there's an explicit form view definition
  const formView = entity.views?.form;

  const sections = formView
    ? buildFormSectionsFromFormView(formView, entity, config.child_entities || {}, config.skill)
    : buildFormSections(entity, config.skill, config.child_entities, actionEntry.entity);

  if (sections.length === 0) return null;

  const isCreate = actionEntry.mode === "create";
  const verb = isCreate ? "New" : "Edit";

  return {
    title: `${verb} ${entity.label}`,
    description: entity.label_plural
      ? `${isCreate ? "Create" : "Update"} a ${entity.label.toLowerCase()}`
      : undefined,
    submit_action: action,
    submit_label: isCreate ? `Create ${entity.label}` : `Update ${entity.label}`,
    sections,
  };
}

// Build sections from explicit form view definition
function buildFormSectionsFromFormView(
  formView: { groups: Array<{
    label: string;
    fields?: string[];
    columns?: number;
    collapsible?: boolean;
    type?: string;
    child_entity?: string;
    add_label?: string;
    computed_fields?: string[];
  }> },
  entity: EntityDef,
  childEntities: Record<string, ChildEntityDef>,
  skill: string
): FormSectionSpec[] {
  const sections: FormSectionSpec[] = [];

  for (const group of formView.groups) {
    if (group.type === "child_table" && group.child_entity) {
      const childDef = childEntities[group.child_entity];
      if (childDef) {
        const childFields = Object.entries(childDef.fields)
          .filter(([, f]) => !f.read_only && !f.hidden)
          .map(([k, f]) => fieldDefToFormField(k, f, skill));

        sections.push({
          label: group.label,
          type: "repeatable",
          key: childDef.param_name || "items",
          min_rows: 1,
          fields: childFields,
        });
      }
      continue;
    }

    if (group.fields) {
      const formFields: FormFieldSpec[] = [];
      for (const fieldKey of group.fields) {
        const fieldDef = entity.fields[fieldKey];
        if (!fieldDef || fieldDef.read_only || fieldDef.hidden) continue;
        formFields.push(fieldDefToFormField(fieldKey, fieldDef, skill));
      }
      if (formFields.length > 0) {
        sections.push({
          label: group.label,
          columns: (group.columns || 1) as 1 | 2,
          fields: formFields,
        });
      }
    }
  }

  return sections;
}

// Get all form-capable actions for a skill
export function getFormActions(config: UIConfig): string[] {
  return Object.entries(config.action_map || {})
    .filter(([, entry]) => entry.component === "FormView" && !entry.hidden)
    .map(([action]) => action);
}

// Get all list actions with their entity info
export function getListActions(config: UIConfig): { action: string; entity: string; label: string; addAction?: string }[] {
  return Object.entries(config.action_map || {})
    .filter(([, entry]) => entry.component === "DataTable")
    .map(([action, entry]) => {
      const entity = config.entities[entry.entity || ""];
      return {
        action,
        entity: entry.entity || "",
        label: entity?.label_plural || action.replace("list-", "").replace(/-/g, " "),
        addAction: entry.add_action,
      };
    });
}

// Get entity detail actions filtered by current status
export function getDetailActions(
  config: UIConfig,
  entityKey: string,
  currentStatus: string
): { action: string; label: string; primary?: boolean; destructive?: boolean }[] {
  const entity = config.entities[entityKey];
  if (!entity?.views?.detail?.actions) return [];

  return entity.views.detail.actions.filter((a) => {
    if (!a.requires_status) return true;
    const statuses = Array.isArray(a.requires_status)
      ? a.requires_status
      : [a.requires_status];
    return statuses.includes(currentStatus.toLowerCase());
  });
}

// Get dashboard config for a skill
export function getDashboardConfig(config: UIConfig) {
  const statusEntry = config.action_map?.["status"];
  if (!statusEntry || statusEntry.component !== "DashboardView") return null;
  return statusEntry.sections || null;
}
