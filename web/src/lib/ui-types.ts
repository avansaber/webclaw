/* _ui response directive types — B1 */

export interface Toast {
  type: "success" | "error" | "warning" | "info";
  message: string;
  detail?: string;
  duration?: number; // ms, default 5000, 0 = sticky
}

export interface Redirect {
  action: string;
  params: Record<string, string>;
  delay?: number; // ms
}

export interface ActionButton {
  action: string;
  label: string;
  params?: Record<string, unknown>;
  primary?: boolean;
  destructive?: boolean;
  confirm?: string;
}

export interface Highlight {
  type: "emphasis" | "warning" | "error" | "status_change" | "delta";
  icon?: string;
  from?: string;
  to?: string;
  delta?: string;
}

export interface Warning {
  message: string;
  field?: string;
  severity: "info" | "warning";
}

export interface Suggestion {
  message: string;
  action?: string;
  params?: Record<string, unknown>;
}

export interface RefreshDirective {
  entity: string;
  scope: "all" | "id";
  id?: string;
}

export interface Badge {
  entity: string;
  count: number;
  label: string;
  severity: "info" | "warning" | "error";
}

export interface UIDirectives {
  toast?: Toast;
  redirect?: Redirect;
  actions?: ActionButton[];
  highlights?: Record<string, Highlight>;
  warnings?: Warning[];
  suggestions?: Suggestion[];
  refresh?: RefreshDirective[];
  badges?: Badge[];
}

export interface ActionResponse {
  status: string;
  message?: string;
  _ui?: UIDirectives;
  [key: string]: unknown;
}
