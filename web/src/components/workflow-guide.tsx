"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileText,
  ClipboardList,
  Truck,
  Receipt,
  CreditCard,
  Package,
  Layers,
  Factory,
  CheckCircle,
  Users,
  Calculator,
  ArrowRight,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  label: string;
  action: string;
  skill?: string;
  icon: string;
}

export interface WorkflowGuideProps {
  skill: string;
}

// ── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  FileText,
  ClipboardList,
  Truck,
  Receipt,
  CreditCard,
  Package,
  Layers,
  Factory,
  CheckCircle,
  Users,
  Calculator,
};

// ── Workflow Definitions ─────────────────────────────────────────────────────

const WORKFLOW_DEFINITIONS: Record<string, WorkflowStep[]> = {
  "erpclaw-selling": [
    { label: "Quote", action: "add-quotation", icon: "FileText" },
    { label: "Sales Order", action: "add-sales-order", icon: "ClipboardList" },
    { label: "Delivery Note", action: "create-delivery-note", icon: "Truck" },
    { label: "Invoice", action: "create-sales-invoice", icon: "Receipt" },
    { label: "Payment", action: "add-payment", skill: "erpclaw-payments", icon: "CreditCard" },
  ],
  "erpclaw-buying": [
    { label: "Purchase Order", action: "add-purchase-order", icon: "ClipboardList" },
    { label: "Receipt", action: "create-purchase-receipt", icon: "Package" },
    { label: "Invoice", action: "create-purchase-invoice", icon: "Receipt" },
    { label: "Payment", action: "add-payment", skill: "erpclaw-payments", icon: "CreditCard" },
  ],
  "erpclaw-manufacturing": [
    { label: "BOM", action: "add-bom", icon: "Layers" },
    { label: "Work Order", action: "add-work-order", icon: "Factory" },
    { label: "Job Card", action: "add-job-card", icon: "ClipboardList" },
    { label: "Completion", action: "complete-work-order", icon: "CheckCircle" },
  ],
  "erpclaw-hr": [
    { label: "Employee", action: "add-employee", icon: "Users" },
    { label: "Salary Structure", action: "add-salary-structure", skill: "erpclaw-payroll", icon: "FileText" },
    { label: "Payroll Run", action: "add-payroll-entry", skill: "erpclaw-payroll", icon: "Calculator" },
    { label: "Salary Slip", action: "list-salary-slips", skill: "erpclaw-payroll", icon: "Receipt" },
  ],
};

// ── Check if a skill has a workflow ──────────────────────────────────────────

export function hasWorkflow(skill: string): boolean {
  return skill in WORKFLOW_DEFINITIONS;
}

// ── WorkflowGuide Component ──────────────────────────────────────────────────

export function WorkflowGuide({ skill }: WorkflowGuideProps) {
  const router = useRouter();
  const steps = WORKFLOW_DEFINITIONS[skill];

  if (!steps || steps.length === 0) return null;

  function handleStepClick(step: WorkflowStep) {
    const targetSkill = step.skill || skill;
    router.push(`/skills/${targetSkill}?action=${step.action}`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Follow these steps to complete the full workflow. Click any step to navigate directly.
      </p>

      {/* Desktop: horizontal pipeline */}
      <div className="hidden md:flex items-center gap-2">
        {steps.map((step, index) => {
          const Icon = ICON_MAP[step.icon] || FileText;
          return (
            <div key={index} className="flex items-center gap-2">
              <Card
                className="cursor-pointer transition-all hover:border-primary hover:shadow-md group min-w-[120px]"
                onClick={() => handleStepClick(step)}
              >
                <CardContent className="flex flex-col items-center gap-2 px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium leading-tight">{step.label}</p>
                    {step.skill && step.skill !== skill && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {step.skill.replace(/^erpclaw-/, "")}
                      </p>
                    )}
                  </div>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {index + 1}
                  </div>
                </CardContent>
              </Card>
              {index < steps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical pipeline */}
      <div className="flex flex-col gap-2 md:hidden">
        {steps.map((step, index) => {
          const Icon = ICON_MAP[step.icon] || FileText;
          return (
            <div key={index} className="flex flex-col items-center gap-2">
              <Card
                className="cursor-pointer transition-all hover:border-primary hover:shadow-md group w-full"
                onClick={() => handleStepClick(step)}
              >
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted group-hover:bg-primary/10 transition-colors shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.label}</p>
                    {step.skill && step.skill !== skill && (
                      <p className="text-[10px] text-muted-foreground">
                        {step.skill.replace(/^erpclaw-/, "")}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
              {index < steps.length - 1 && (
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
