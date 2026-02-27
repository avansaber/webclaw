// ── UI.yaml TypeScript Types ─────────────────────────────────────────────────
// Matches the ocui_version: "1.0" YAML schema used by all erpclaw skills.

export interface UIConfig {
  ocui_version: string;
  skill: string;
  skill_version: string;
  display_name: string;
  icon?: string;
  color?: string;
  entities: Record<string, EntityDef>;
  child_entities?: Record<string, ChildEntityDef>;
  action_map: Record<string, ActionMapEntry>;
}

// ── Entity Definitions ───────────────────────────────────────────────────────

export interface EntityDef {
  label: string;
  label_plural: string;
  icon?: string;
  table: string;
  id_col: string;
  name_col: string;
  primary_field: string;
  secondary_field?: string;
  identifier_field: string;
  status_field?: string;
  status_colors?: Record<string, string>;
  lifecycle?: string; // e.g. "draft-submit-cancel"
  filter_condition?: string;
  fields: Record<string, FieldDef>;
  form_groups?: Record<string, FormGroupDef>;
  views?: {
    list?: ListViewDef;
    detail?: DetailViewDef;
    form?: FormViewDef;
  };
}

export type UIFieldType =
  | "text"
  | "number"
  | "integer"
  | "currency"
  | "percent"
  | "quantity"
  | "date"
  | "datetime"
  | "textarea"
  | "select"
  | "boolean"
  | "link"
  | "status"
  | "json";

export interface FieldDef {
  type: UIFieldType;
  label: string;
  required?: boolean;
  read_only?: boolean;
  hidden?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  help_text?: string;
  min?: string | number;
  max?: string | number;
  precision?: number;
  max_length?: number;
  pattern?: string;
  pattern_message?: string;
  searchable?: boolean;
  emphasis?: boolean;
  computed?: string;
  options?: { value: string; label: string }[];
  // Link field config
  link_entity?: string;
  link_display_field?: string;
  link_search_action?: string;
  link_create_action?: string;
  on_change?: { target: string; source: string }[];
  // Form parameter override (when action param name differs from entity field key)
  param_name?: string;
  // View hints
  in_list_view?: boolean;
  in_detail_view?: boolean;
  in_form_view?: boolean;
  form_group?: string;
  form_order?: number;
}

export interface FormGroupDef {
  label: string;
  order: number;
  columns?: number;
  type?: "child_table";
  collapsible?: boolean;
  help_text?: string;
}

// ── View Definitions ─────────────────────────────────────────────────────────

export interface ListColumnDef {
  field: string;
  width?: number;
  link?: boolean;
  align?: "left" | "right" | "center";
}

export interface ListFilterDef {
  field: string;
  type: "select" | "text" | "date_range" | "link";
  label?: string;
}

export interface BulkActionDef {
  action: string;
  label: string;
  requires_status?: string;
  destructive?: boolean;
}

export interface ListViewDef {
  columns: ListColumnDef[];
  filters?: ListFilterDef[];
  bulk_actions?: BulkActionDef[];
  row_click?: string | null;
}

export interface DetailSectionDef {
  label: string;
  fields?: string[];
  columns?: number;
  collapsible?: boolean;
  type?: "child_table" | "related_list";
  // Child table
  child_entity?: string;
  child_fields?: string[];
  summary_fields?: { field: string; aggregate: string }[];
  // Related list
  related_entity?: string;
  related_action?: string;
  related_fields?: string[];
  filter_field?: string;
}

export interface DetailActionDef {
  action: string;
  label: string;
  requires_status?: string | string[];
  primary?: boolean;
  destructive?: boolean;
}

export interface DetailViewDef {
  header: {
    title_field: string;
    subtitle_field?: string;
    status_field?: string;
    amount_field?: string;
  };
  sections: DetailSectionDef[];
  actions?: DetailActionDef[];
}

export interface FormViewDef {
  groups: {
    label: string;
    fields?: string[];
    columns?: number;
    collapsible?: boolean;
    type?: "child_table";
    child_entity?: string;
    add_label?: string;
    computed_fields?: string[];
  }[];
}

// ── Child Entity Definitions ─────────────────────────────────────────────────

export interface ChildEntityDef {
  parent_entity: string;
  parent_field: string;
  param_name?: string; // CLI parameter name (e.g. "lines", "items", "components")
  fields: Record<string, FieldDef>;
}

// ── Action Map ───────────────────────────────────────────────────────────────

export interface WizardStep {
  label: string;
  type: "detail" | "confirmation";
  message?: string;
  destructive?: boolean;
}

export interface ActionRelated {
  entity: string;
  action: string;
  filter_field: string;
  label: string;
}

export interface ActionChildTable {
  entity: string;
  form_group: string;
  add_label: string;
}

export interface DashboardSection {
  key: string;
  label: string;
  metric_type: "count" | "status_breakdown" | "currency";
}

export interface ActionMapEntry {
  component: "FormView" | "DetailView" | "DataTable" | "WizardFlow" | "DashboardView" | null;
  hidden?: boolean;
  entity?: string;
  mode?: "create" | "edit";
  success_redirect?: string;
  success_toast?: string;
  related?: ActionRelated[];
  child_tables?: ActionChildTable[];
  steps?: WizardStep[];
  default_sort?: string;
  default_sort_dir?: "asc" | "desc";
  searchable?: boolean;
  add_action?: string;
  sections?: DashboardSection[];
}
