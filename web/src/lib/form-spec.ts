// ── Form Spec Types ─────────────────────────────────────────────────────────
// Declarative form specifications that can be hand-crafted or AI-generated.
// A single <DynamicForm /> component renders any form from a spec.

export type FieldType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "textarea"
  | "select"
  | "entity-lookup"
  | "boolean";

export interface FormFieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  helpText?: string;
  description?: string; // Tooltip description from param metadata
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  // Entity lookup config
  entity_skill?: string; // defaults to current skill
  entity_action?: string; // list-* action for search
  entity_value_field?: string; // default: "id"
  entity_display_field?: string; // default: "name"
}

export interface FormSectionSpec {
  label: string;
  columns?: 1 | 2;
  type?: "fields" | "repeatable";
  key?: string; // for repeatable: the param key for the JSON array
  min_rows?: number;
  max_rows?: number;
  fields: FormFieldSpec[];
}

export interface FormSpec {
  title: string;
  description?: string;
  submit_action: string;
  submit_label?: string;
  sections: FormSectionSpec[];
}

// ── Default Resolution ──────────────────────────────────────────────────────

export function resolveDefault(
  def: string | number | boolean | undefined
): string {
  if (def === undefined || def === null) return "";
  if (def === "today") return new Date().toISOString().split("T")[0];
  if (typeof def === "string" && def.startsWith("today+")) {
    const days = parseInt(def.replace("today+", ""), 10);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }
  return String(def);
}

// ── Demo Form Specs ─────────────────────────────────────────────────────────
// Hand-crafted specs for erpclaw-selling. In production, these would come from
// SKILL.md _ui.forms sections or be AI-generated and cached.

export const DEMO_FORM_SPECS: Record<string, Record<string, FormSpec>> = {
  "erpclaw-selling": {
    "add-sales-invoice": {
      title: "New Sales Invoice",
      description: "Create a draft sales invoice for a customer",
      submit_action: "add-sales-invoice",
      submit_label: "Create Invoice",
      sections: [
        {
          label: "Invoice Details",
          columns: 2,
          fields: [
            {
              key: "customer-id",
              label: "Customer",
              type: "entity-lookup",
              entity_action: "list-customers",
              entity_value_field: "id",
              entity_display_field: "customer_name",
              required: true,
              placeholder: "Search customers...",
            },
            {
              key: "posting-date",
              label: "Invoice Date",
              type: "date",
              required: true,
              default: "today",
            },
            {
              key: "due-date",
              label: "Due Date",
              type: "date",
              default: "today+30",
            },
          ],
        },
        {
          label: "Line Items",
          type: "repeatable",
          key: "items",
          min_rows: 1,
          fields: [
            {
              key: "item-id",
              label: "Item",
              type: "entity-lookup",
              entity_skill: "erpclaw-inventory",
              entity_action: "list-items",
              entity_value_field: "id",
              entity_display_field: "item_name",
              required: true,
              placeholder: "Search items...",
            },
            {
              key: "qty",
              label: "Qty",
              type: "number",
              min: 1,
              default: 1,
              required: true,
            },
            {
              key: "rate",
              label: "Rate",
              type: "currency",
              required: true,
              placeholder: "0.00",
            },
          ],
        },
        {
          label: "Additional",
          columns: 2,
          fields: [
            {
              key: "remarks",
              label: "Remarks",
              type: "textarea",
              placeholder: "Optional notes...",
            },
          ],
        },
      ],
    },

    "add-customer": {
      title: "New Customer",
      description: "Add a new customer to the system",
      submit_action: "add-customer",
      submit_label: "Create Customer",
      sections: [
        {
          label: "Customer Information",
          columns: 2,
          fields: [
            {
              key: "customer-name",
              label: "Customer Name",
              type: "text",
              required: true,
              placeholder: "e.g. Wayne Enterprises",
            },
            {
              key: "customer-type",
              label: "Customer Type",
              type: "select",
              options: [
                { label: "Company", value: "Company" },
                { label: "Individual", value: "Individual" },
              ],
              default: "Company",
            },
          ],
        },
        {
          label: "Contact Details",
          columns: 2,
          fields: [
            {
              key: "email",
              label: "Email",
              type: "text",
              placeholder: "email@example.com",
            },
            {
              key: "phone",
              label: "Phone",
              type: "text",
              placeholder: "+1 555-0123",
            },
            {
              key: "tax-id",
              label: "Tax ID",
              type: "text",
              placeholder: "EIN or SSN",
            },
          ],
        },
      ],
    },

    "add-sales-order": {
      title: "New Sales Order",
      description: "Create a draft sales order",
      submit_action: "add-sales-order",
      submit_label: "Create Order",
      sections: [
        {
          label: "Order Details",
          columns: 2,
          fields: [
            {
              key: "customer-id",
              label: "Customer",
              type: "entity-lookup",
              entity_action: "list-customers",
              entity_value_field: "id",
              entity_display_field: "customer_name",
              required: true,
              placeholder: "Search customers...",
            },
            {
              key: "delivery-date",
              label: "Delivery Date",
              type: "date",
            },
          ],
        },
        {
          label: "Items",
          type: "repeatable",
          key: "items",
          min_rows: 1,
          fields: [
            {
              key: "item-id",
              label: "Item",
              type: "entity-lookup",
              entity_skill: "erpclaw-inventory",
              entity_action: "list-items",
              entity_value_field: "id",
              entity_display_field: "item_name",
              required: true,
              placeholder: "Search items...",
            },
            {
              key: "qty",
              label: "Qty",
              type: "number",
              min: 1,
              default: 1,
              required: true,
            },
            {
              key: "rate",
              label: "Rate",
              type: "currency",
              required: true,
              placeholder: "0.00",
            },
          ],
        },
      ],
    },
  },
};
