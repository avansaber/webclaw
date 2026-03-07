import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowHints } from "@/components/workflow-hints";
import type { WorkflowSuggestion } from "@/lib/ui-yaml-types";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  CheckCircle2: ({ className }: { className: string }) => <span data-testid="check-icon" className={className} />,
  ArrowRight: ({ className }: { className: string }) => <span data-testid="arrow-icon" className={className} />,
  ChevronRight: ({ className }: { className: string }) => <span data-testid="chevron-icon" className={className} />,
  X: ({ className }: { className: string }) => <span data-testid="x-icon" className={className} />,
}));

const baseSuggestions: WorkflowSuggestion[] = [
  { action: "add-unit", label: "Add units for this property" },
  { action: "add-lease", label: "Create a lease", pass: { "property-id": "id" } },
];

const crossSkillSuggestion: WorkflowSuggestion[] = [
  { action: "add-sales-invoice", label: "Create invoice", skill: "erpclaw" },
];

describe("WorkflowHints", () => {
  it("renders completed action label", () => {
    render(
      <WorkflowHints
        completedAction="add-property"
        suggestions={baseSuggestions}
        responseData={{ id: "P001" }}
        skill="propclaw"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/Add Property — Success/)).toBeInTheDocument();
  });

  it("renders all suggestion buttons", () => {
    render(
      <WorkflowHints
        completedAction="add-property"
        suggestions={baseSuggestions}
        responseData={{ id: "P001" }}
        skill="propclaw"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Add units for this property")).toBeInTheDocument();
    expect(screen.getByText("Create a lease")).toBeInTheDocument();
  });

  it("calls onSelect with resolved pass params", () => {
    const onSelect = vi.fn();
    render(
      <WorkflowHints
        completedAction="add-property"
        suggestions={baseSuggestions}
        responseData={{ id: "P001", name: "123 Main St" }}
        skill="propclaw"
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Create a lease"));
    expect(onSelect).toHaveBeenCalledWith("add-lease", "propclaw", { "property-id": "P001" });
  });

  it("resolves pass params from nested data object", () => {
    const onSelect = vi.fn();
    render(
      <WorkflowHints
        completedAction="add-property"
        suggestions={[{ action: "add-unit", label: "Add unit", pass: { "property-id": "id" } }]}
        responseData={{ data: { id: "P002" } }}
        skill="propclaw"
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Add unit"));
    expect(onSelect).toHaveBeenCalledWith("add-unit", "propclaw", { "property-id": "P002" });
  });

  it("shows cross-skill label for suggestions from other skills", () => {
    render(
      <WorkflowHints
        completedAction="submit-quotation"
        suggestions={crossSkillSuggestion}
        responseData={{}}
        skill="propclaw"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Create invoice")).toBeInTheDocument();
    expect(screen.getByText("erpclaw")).toBeInTheDocument();
  });

  it("uses fixed bottom-right positioning", () => {
    const { container } = render(
      <WorkflowHints
        completedAction="add-property"
        suggestions={baseSuggestions}
        responseData={{}}
        skill="propclaw"
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("fixed");
    expect(wrapper?.className).toContain("bottom-4");
    expect(wrapper?.className).toContain("right-4");
  });
});
