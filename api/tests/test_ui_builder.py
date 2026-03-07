"""Tests for UIBuilder and _ui auto-enrichment — Sprint B2."""
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ui_builder import UIBuilder
from skills.executor import _auto_ui


# ---------------------------------------------------------------------------
# UIBuilder unit tests
# ---------------------------------------------------------------------------

def test_empty_builder_returns_none():
    assert UIBuilder().build() is None


def test_toast():
    ui = UIBuilder().toast("success", "Created", detail="Invoice INV-001").build()
    assert ui["toast"]["type"] == "success"
    assert ui["toast"]["message"] == "Created"
    assert ui["toast"]["detail"] == "Invoice INV-001"


def test_toast_duration():
    ui = UIBuilder().toast("error", "Failed", duration=0).build()
    assert ui["toast"]["duration"] == 0


def test_redirect():
    ui = UIBuilder().redirect("get-invoice", {"id": "abc"}, delay=500).build()
    assert ui["redirect"]["action"] == "get-invoice"
    assert ui["redirect"]["params"]["id"] == "abc"
    assert ui["redirect"]["delay"] == 500


def test_action_buttons():
    ui = (
        UIBuilder()
        .action("edit", "Edit", params={"id": "1"})
        .action("submit", "Submit", primary=True)
        .action("delete", "Delete", destructive=True, confirm="Are you sure?")
        .build()
    )
    assert len(ui["actions"]) == 3
    assert ui["actions"][0]["action"] == "edit"
    assert ui["actions"][1]["primary"] is True
    assert ui["actions"][2]["destructive"] is True
    assert ui["actions"][2]["confirm"] == "Are you sure?"


def test_highlights():
    ui = (
        UIBuilder()
        .highlight("status", "status_change", from_val="draft", to_val="submitted")
        .highlight("total", "delta", delta="+$5,000")
        .highlight("amount", "error")
        .build()
    )
    assert ui["highlights"]["status"]["from"] == "draft"
    assert ui["highlights"]["status"]["to"] == "submitted"
    assert ui["highlights"]["total"]["delta"] == "+$5,000"
    assert ui["highlights"]["amount"]["type"] == "error"


def test_warnings():
    ui = (
        UIBuilder()
        .warning("Low stock", field="qty", severity="warning")
        .warning("FYI: rate changed", severity="info")
        .build()
    )
    assert len(ui["warnings"]) == 2
    assert ui["warnings"][0]["field"] == "qty"
    assert ui["warnings"][1]["severity"] == "info"


def test_suggestions():
    ui = (
        UIBuilder()
        .suggestion("Consider splitting the order", action="add-order", params={"type": "split"})
        .build()
    )
    assert len(ui["suggestions"]) == 1
    assert ui["suggestions"][0]["action"] == "add-order"


def test_refresh():
    ui = (
        UIBuilder()
        .refresh("gl_entry")
        .refresh("account", scope="id", id="ACC-001")
        .build()
    )
    assert len(ui["refresh"]) == 2
    assert ui["refresh"][0]["scope"] == "all"
    assert ui["refresh"][1]["id"] == "ACC-001"


def test_badges():
    ui = UIBuilder().badge("invoice", 7, "7 overdue", severity="warning").build()
    assert ui["badges"][0]["count"] == 7
    assert ui["badges"][0]["severity"] == "warning"


def test_chaining():
    ui = (
        UIBuilder()
        .toast("success", "Done")
        .redirect("get-item", {"id": "x"})
        .action("edit", "Edit")
        .highlight("status", "emphasis")
        .warning("Check this")
        .suggestion("Try that")
        .refresh("item")
        .badge("item", 1, "1 new")
        .build()
    )
    assert "toast" in ui
    assert "redirect" in ui
    assert len(ui["actions"]) == 1
    assert "highlights" in ui
    assert len(ui["warnings"]) == 1
    assert len(ui["suggestions"]) == 1
    assert len(ui["refresh"]) == 1
    assert len(ui["badges"]) == 1


# ---------------------------------------------------------------------------
# Auto-UI enrichment tests
# ---------------------------------------------------------------------------

def test_auto_ui_error():
    result = {"status": "error", "message": "Not found"}
    ui = _auto_ui("get-item", result)
    assert ui["toast"]["type"] == "error"
    assert ui["toast"]["duration"] == 0


def test_auto_ui_add():
    result = {"status": "ok", "name": "INV-001"}
    ui = _auto_ui("add-invoice", result)
    assert ui["toast"]["type"] == "success"
    assert "INV-001" in ui["toast"]["message"]


def test_auto_ui_submit():
    result = {"status": "ok", "message": "Submitted 6 GL entries"}
    ui = _auto_ui("submit-invoice", result)
    assert ui["toast"]["type"] == "success"


def test_auto_ui_cancel():
    result = {"status": "ok"}
    ui = _auto_ui("cancel-invoice", result)
    assert ui["toast"]["type"] == "warning"


def test_auto_ui_delete():
    result = {"status": "ok"}
    ui = _auto_ui("delete-invoice", result)
    assert ui["toast"]["type"] == "info"


def test_auto_ui_list_returns_none():
    """List actions don't need auto-toast."""
    result = {"status": "ok", "items": []}
    ui = _auto_ui("list-invoices", result)
    assert ui is None
