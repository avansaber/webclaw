"""UIBuilder — fluent builder for _ui response directives (Sprint B2).

Skills use this to attach rendering hints to their JSON responses.
The frontend processes these via ui-processor.ts.

Usage:
    from ui_builder import UIBuilder

    ui = UIBuilder()
    ui.toast("success", "Invoice created")
    ui.redirect("get-sales-invoice", {"invoice_id": "abc"})
    ui.action("submit-sales-invoice", "Submit", primary=True)

    response = {"status": "ok", "id": invoice_id, "_ui": ui.build()}
"""

from __future__ import annotations


class UIBuilder:
    """Fluent builder for _ui response directives."""

    __slots__ = ("_ui",)

    def __init__(self) -> None:
        self._ui: dict = {}

    # ── Toast ──────────────────────────────────────────────────────────────

    def toast(
        self,
        type: str,
        message: str,
        detail: str | None = None,
        duration: int | None = None,
    ) -> UIBuilder:
        """Add toast notification.

        Args:
            type: 'success' | 'error' | 'warning' | 'info'
            message: Short message
            detail: Optional longer description
            duration: Auto-dismiss ms (default 5000, 0 = sticky)
        """
        t: dict = {"type": type, "message": message}
        if detail is not None:
            t["detail"] = detail
        if duration is not None:
            t["duration"] = duration
        self._ui["toast"] = t
        return self

    # ── Redirect ───────────────────────────────────────────────────────────

    def redirect(
        self,
        action: str,
        params: dict | None = None,
        delay: int | None = None,
    ) -> UIBuilder:
        """Navigate after action completes."""
        r: dict = {"action": action, "params": params or {}}
        if delay is not None:
            r["delay"] = delay
        self._ui["redirect"] = r
        return self

    # ── Action buttons ─────────────────────────────────────────────────────

    def action(
        self,
        action: str,
        label: str,
        *,
        primary: bool = False,
        destructive: bool = False,
        params: dict | None = None,
        confirm: str | None = None,
    ) -> UIBuilder:
        """Add a suggested next action button."""
        btn: dict = {"action": action, "label": label}
        if primary:
            btn["primary"] = True
        if destructive:
            btn["destructive"] = True
        if params:
            btn["params"] = params
        if confirm:
            btn["confirm"] = confirm
        self._ui.setdefault("actions", []).append(btn)
        return self

    # ── Highlights ─────────────────────────────────────────────────────────

    def highlight(
        self,
        field: str,
        type: str,
        *,
        icon: str | None = None,
        from_val: str | None = None,
        to_val: str | None = None,
        delta: str | None = None,
    ) -> UIBuilder:
        """Highlight a field (emphasis / warning / error / status_change / delta)."""
        h: dict = {"type": type}
        if icon:
            h["icon"] = icon
        if from_val is not None:
            h["from"] = from_val
        if to_val is not None:
            h["to"] = to_val
        if delta:
            h["delta"] = delta
        self._ui.setdefault("highlights", {})[field] = h
        return self

    # ── Warnings ───────────────────────────────────────────────────────────

    def warning(
        self, message: str, *, field: str | None = None, severity: str = "warning"
    ) -> UIBuilder:
        """Add an inline warning."""
        w: dict = {"message": message, "severity": severity}
        if field:
            w["field"] = field
        self._ui.setdefault("warnings", []).append(w)
        return self

    # ── Suggestions ────────────────────────────────────────────────────────

    def suggestion(
        self,
        message: str,
        *,
        action: str | None = None,
        params: dict | None = None,
    ) -> UIBuilder:
        """Add an AI / rule-based suggestion."""
        s: dict = {"message": message}
        if action:
            s["action"] = action
        if params:
            s["params"] = params
        self._ui.setdefault("suggestions", []).append(s)
        return self

    # ── Refresh ────────────────────────────────────────────────────────────

    def refresh(
        self, entity: str, scope: str = "all", id: str | None = None
    ) -> UIBuilder:
        """Tell frontend to refetch related data."""
        r: dict = {"entity": entity, "scope": scope}
        if id and scope == "id":
            r["id"] = id
        self._ui.setdefault("refresh", []).append(r)
        return self

    # ── Badges ─────────────────────────────────────────────────────────────

    def badge(
        self, entity: str, count: int, label: str, severity: str = "info"
    ) -> UIBuilder:
        """Update a sidebar/nav badge counter."""
        self._ui.setdefault("badges", []).append(
            {"entity": entity, "count": count, "label": label, "severity": severity}
        )
        return self

    # ── Build ──────────────────────────────────────────────────────────────

    def build(self) -> dict | None:
        """Return _ui dict, or None if empty."""
        return self._ui if self._ui else None
