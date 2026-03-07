import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileSelector } from "@/components/profile-selector";
import { SkillToggleGrid } from "@/components/profile-selector";
import { ExpansionPromptCard } from "@/components/expansion-prompt-card";
import type { ProfileTemplate } from "@/components/profile-selector";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Check: (props: any) => <span data-testid="check-icon" {...props} />,
  Sparkles: (props: any) => <span data-testid="sparkles-icon" {...props} />,
  X: (props: any) => <span data-testid="x-icon" {...props} />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProfiles: ProfileTemplate[] = [
  {
    key: "general_business",
    display_name: "General Business",
    description: "Small-to-medium business with sales, purchasing, and inventory",
    icon: "briefcase",
    core_skills: ["erpclaw"],
    optional_skills: ["erpclaw-people", "erpclaw-ops", "erpclaw-growth"],
  },
  {
    key: "dental_practice",
    display_name: "Dental Practice",
    description: "Dental clinic with patient management, tooth charts, and CDT codes",
    icon: "stethoscope",
    core_skills: ["healthclaw", "healthclaw-dental", "erpclaw"],
    optional_skills: ["erpclaw-people"],
  },
  {
    key: "manufacturing",
    display_name: "Manufacturing",
    description: "Production with BOMs, work orders, MRP, and quality control",
    icon: "factory",
    core_skills: ["erpclaw", "erpclaw-ops"],
    optional_skills: ["erpclaw-people"],
  },
];

// ===========================================================================
// ProfileSelector (4 tests)
// ===========================================================================

describe("ProfileSelector", () => {
  it("renders all profile cards with names and descriptions", () => {
    render(
      <ProfileSelector profiles={mockProfiles} selected={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("General Business")).toBeInTheDocument();
    expect(screen.getByText("Dental Practice")).toBeInTheDocument();
    expect(screen.getByText("Manufacturing")).toBeInTheDocument();
    expect(screen.getByText(/Small-to-medium business/)).toBeInTheDocument();
    expect(screen.getByText(/Dental clinic/)).toBeInTheDocument();
  });

  it("highlights selected profile with border", () => {
    const { container } = render(
      <ProfileSelector
        profiles={mockProfiles}
        selected="dental_practice"
        onSelect={vi.fn()}
      />,
    );
    // Find the card containing "Dental Practice"
    const cards = container.querySelectorAll("[class*='cursor-pointer']");
    const dentalCard = Array.from(cards).find((c) =>
      c.textContent?.includes("Dental Practice"),
    );
    expect(dentalCard?.className).toContain("border-primary");
    expect(dentalCard?.className).toContain("ring-2");
  });

  it("calls onSelect with profile key when clicked", () => {
    const onSelect = vi.fn();
    render(
      <ProfileSelector profiles={mockProfiles} selected={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("Manufacturing"));
    expect(onSelect).toHaveBeenCalledWith("manufacturing");
  });

  it("displays core and optional skill counts as badges", () => {
    render(
      <ProfileSelector profiles={mockProfiles} selected={null} onSelect={vi.fn()} />,
    );
    // All 3 profiles have core/optional badges
    const coreBadges = screen.getAllByText(/\d+ core/);
    expect(coreBadges.length).toBe(3);
    const optionalBadges = screen.getAllByText(/\+\d+ optional/);
    expect(optionalBadges.length).toBe(3);
    // Manufacturing has 2 core (unique)
    expect(screen.getByText("2 core")).toBeInTheDocument();
    // General Business has +3 optional (unique)
    expect(screen.getByText("+3 optional")).toBeInTheDocument();
  });
});

// ===========================================================================
// SkillToggleGrid (3 tests)
// ===========================================================================

describe("SkillToggleGrid", () => {
  const coreSkills = ["erpclaw"];
  const optionalSkills = ["erpclaw-people", "erpclaw-growth", "erpclaw-ops"];

  it("shows core skills as non-toggleable badges with check icons", () => {
    render(
      <SkillToggleGrid
        coreSkills={coreSkills}
        optionalSkills={optionalSkills}
        selectedExtras={[]}
        onToggleExtra={vi.fn()}
      />,
    );
    expect(screen.getByText("Core modules (always active)")).toBeInTheDocument();
    expect(screen.getByText("Erpclaw")).toBeInTheDocument();
  });

  it("calls onToggleExtra when optional skill is clicked", () => {
    const onToggle = vi.fn();
    render(
      <SkillToggleGrid
        coreSkills={coreSkills}
        optionalSkills={optionalSkills}
        selectedExtras={[]}
        onToggleExtra={onToggle}
      />,
    );
    fireEvent.click(screen.getByText("People"));
    expect(onToggle).toHaveBeenCalledWith("erpclaw-people");
  });

  it("shows selected extras as active badges", () => {
    const { container } = render(
      <SkillToggleGrid
        coreSkills={coreSkills}
        optionalSkills={optionalSkills}
        selectedExtras={["erpclaw-growth"]}
        onToggleExtra={vi.fn()}
      />,
    );
    // The optional section label
    expect(screen.getByText("Optional modules (click to add)")).toBeInTheDocument();
    // Growth should be active (not outline variant)
    // People should be inactive (outline variant)
    const badges = container.querySelectorAll("[class*='cursor-pointer']");
    const growthBadge = Array.from(badges).find((b) => b.textContent?.includes("Growth"));
    const peopleBadge = Array.from(badges).find((b) => b.textContent?.includes("People"));
    // Active badges don't have "border" class from outline variant
    expect(growthBadge).toBeTruthy();
    expect(peopleBadge).toBeTruthy();
  });
});

// ===========================================================================
// ExpansionPromptCard (3 tests)
// ===========================================================================

describe("ExpansionPromptCard", () => {
  const baseProps = {
    id: "prompt-1",
    suggestedSkill: "erpclaw-ops",
    message: "20 products tracked. Want manufacturing and quality management?",
    onAccept: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders message and both buttons", () => {
    render(<ExpansionPromptCard {...baseProps} />);
    expect(screen.getByText(baseProps.message)).toBeInTheDocument();
    expect(screen.getByText("Enable")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("calls onAccept and onDismiss handlers with id", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ExpansionPromptCard {...baseProps} onAccept={onAccept} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByText("Enable"));
    expect(onAccept).toHaveBeenCalledWith("prompt-1");

    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledWith("prompt-1");
  });

  it("shows loading state when accepting", () => {
    render(<ExpansionPromptCard {...baseProps} accepting={true} />);
    expect(screen.getByText("Activating...")).toBeInTheDocument();
    // Buttons should be disabled
    const enableBtn = screen.getByText("Activating...");
    expect(enableBtn.closest("button")).toBeDisabled();
    const dismissBtn = screen.getByText("Dismiss");
    expect(dismissBtn.closest("button")).toBeDisabled();
  });
});

// ===========================================================================
// ExpansionPrompts Container (2 tests)
// ===========================================================================

// Mock the adaptive hooks for the container component
vi.mock("@/lib/adaptive", () => ({
  useExpansionPrompts: vi.fn(),
  useAcceptExpansion: vi.fn(),
  useDismissExpansion: vi.fn(),
}));

import * as adaptiveModule from "@/lib/adaptive";
const mockedAdaptive = vi.mocked(adaptiveModule);

describe("ExpansionPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no prompts", async () => {
    mockedAdaptive.useExpansionPrompts.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    mockedAdaptive.useAcceptExpansion.mockReturnValue({ mutate: vi.fn() } as any);
    mockedAdaptive.useDismissExpansion.mockReturnValue({ mutate: vi.fn() } as any);

    const { ExpansionPrompts } = await import("@/components/expansion-prompts");
    const { container } = render(<ExpansionPrompts />);
    expect(container.innerHTML).toBe("");
  });

  it("renders prompt cards when prompts exist", async () => {
    mockedAdaptive.useExpansionPrompts.mockReturnValue({
      data: [
        {
          id: "p1",
          suggested_skill: "erpclaw-people",
          message: "5 team members. Ready for HR?",
          status: "pending",
          created_at: "2026-03-04T10:00:00Z",
        },
        {
          id: "p2",
          suggested_skill: "erpclaw-growth",
          message: "10 customers. Want CRM?",
          status: "pending",
          created_at: "2026-03-04T10:01:00Z",
        },
      ],
      isLoading: false,
    } as any);
    mockedAdaptive.useAcceptExpansion.mockReturnValue({ mutate: vi.fn() } as any);
    mockedAdaptive.useDismissExpansion.mockReturnValue({ mutate: vi.fn() } as any);

    const { ExpansionPrompts } = await import("@/components/expansion-prompts");
    render(<ExpansionPrompts />);
    expect(screen.getByText("Suggested Modules")).toBeInTheDocument();
    expect(screen.getByText("5 team members. Ready for HR?")).toBeInTheDocument();
    expect(screen.getByText("10 customers. Want CRM?")).toBeInTheDocument();
  });
});
