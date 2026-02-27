/* Process _ui directives from action responses — B1 */

import type {
  ActionResponse,
  Toast,
  Redirect,
  ActionButton,
  Highlight,
  Warning,
  Suggestion,
  RefreshDirective,
  Badge,
} from "./ui-types";

export interface UICallbacks {
  showToast?: (toast: Toast) => void;
  scheduleRedirect?: (redirect: Redirect) => void;
  setAvailableActions?: (actions: ActionButton[]) => void;
  applyHighlights?: (highlights: Record<string, Highlight>) => void;
  showWarnings?: (warnings: Warning[]) => void;
  showSuggestions?: (suggestions: Suggestion[]) => void;
  invalidateQueries?: (refresh: RefreshDirective[]) => void;
  updateBadges?: (badges: Badge[]) => void;
}

/**
 * Process _ui directives from an action response, calling provided callbacks.
 * Returns true if any directive was processed.
 */
export function processUIDirectives(
  response: ActionResponse,
  callbacks: UICallbacks
): boolean {
  const ui = response._ui;
  if (!ui) return false;

  let processed = false;

  if (ui.toast && callbacks.showToast) {
    callbacks.showToast(ui.toast);
    processed = true;
  }
  if (ui.actions && callbacks.setAvailableActions) {
    callbacks.setAvailableActions(ui.actions);
    processed = true;
  }
  if (ui.highlights && callbacks.applyHighlights) {
    callbacks.applyHighlights(ui.highlights);
    processed = true;
  }
  if (ui.warnings && callbacks.showWarnings) {
    callbacks.showWarnings(ui.warnings);
    processed = true;
  }
  if (ui.suggestions && callbacks.showSuggestions) {
    callbacks.showSuggestions(ui.suggestions);
    processed = true;
  }
  if (ui.refresh && callbacks.invalidateQueries) {
    callbacks.invalidateQueries(ui.refresh);
    processed = true;
  }
  if (ui.badges && callbacks.updateBadges) {
    callbacks.updateBadges(ui.badges);
    processed = true;
  }
  // Redirect last — may navigate away
  if (ui.redirect && callbacks.scheduleRedirect) {
    callbacks.scheduleRedirect(ui.redirect);
    processed = true;
  }

  return processed;
}
