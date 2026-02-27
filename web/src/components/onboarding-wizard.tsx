"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Loader2,
  Package,
  PartyPopper,
  SkipForward,
} from "lucide-react";
import { fetchApi, getSkills, type Skill, skillDisplayName } from "@/lib/api";

const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "INR", label: "INR - Indian Rupee" },
];

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const STEPS = [
  { number: 2, label: "Company Setup" },
  { number: 3, label: "Modules" },
  { number: 4, label: "Demo Data" },
  { number: 5, label: "Complete" },
];

interface OnboardingWizardProps {
  adminName: string;
  adminEmail: string;
}

export function OnboardingWizard({
  adminName,
  adminEmail,
}: OnboardingWizardProps) {
  const router = useRouter();

  // Wizard state (steps 2-5, displayed as steps 2/3/4/5)
  const [currentStep, setCurrentStep] = useState(2);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [animating, setAnimating] = useState(false);

  // Step 2: Company setup
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [fiscalMonth, setFiscalMonth] = useState("1");
  const [companyError, setCompanyError] = useState("");
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyCreated, setCompanyCreated] = useState(false);

  // Step 3: Module overview
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);

  // Step 4: Demo data
  const [loadDemoData, setLoadDemoData] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoProgress, setDemoProgress] = useState("");
  const [demoComplete, setDemoComplete] = useState(false);
  const [demoError, setDemoError] = useState("");

  // Load skills for step 3
  useEffect(() => {
    getSkills()
      .then(setSkills)
      .catch(() => {})
      .finally(() => setSkillsLoading(false));
  }, []);

  function goToStep(step: number) {
    if (animating) return;
    setDirection(step > currentStep ? "forward" : "backward");
    setAnimating(true);
    setTimeout(() => {
      setCurrentStep(step);
      setAnimating(false);
    }, 200);
  }

  async function handleCompanySetup() {
    if (!companyName.trim()) {
      setCompanyError("Company name is required");
      return;
    }
    setCompanyError("");
    setCompanySubmitting(true);
    try {
      const res = await fetchApi("/erpclaw-setup/setup-company", {
        method: "POST",
        body: JSON.stringify({
          name: companyName.trim(),
          currency,
          fiscal_year_start_month: fiscalMonth,
        }),
      });
      if (res.status !== "ok") {
        // Company may already exist (e.g., created via Telegram onboarding or seed-demo-data)
        // Check if a company exists and proceed if so
        const listRes = await fetchApi("/erpclaw-setup/list-companies", {
          method: "GET",
        });
        if (listRes.status === "ok" && Number(listRes.total_count) > 0) {
          // Company already exists — show info and proceed
          setCompanyError("");
          setCompanyCreated(true);
          setCompanySubmitting(false);
          goToStep(3);
          return;
        }
        setCompanyError(
          (res.message as string) || "Failed to create company"
        );
        setCompanySubmitting(false);
        return;
      }
      setCompanyCreated(true);
      setCompanySubmitting(false);
      goToStep(3);
    } catch {
      setCompanyError("Network error");
      setCompanySubmitting(false);
    }
  }

  async function handleDemoData(): Promise<boolean> {
    setDemoLoading(true);
    setDemoError("");
    setDemoProgress("Initializing demo data...");

    const progressMessages = [
      "Creating chart of accounts...",
      "Setting up customers and suppliers...",
      "Generating inventory items...",
      "Creating sample transactions...",
      "Building GL entries...",
      "Finalizing setup...",
    ];

    let msgIndex = 0;
    const interval = setInterval(() => {
      msgIndex++;
      if (msgIndex < progressMessages.length) {
        setDemoProgress(progressMessages[msgIndex]);
      }
    }, 3000);

    try {
      const res = await fetchApi("/erpclaw/seed-demo-data", {
        method: "POST",
      });
      clearInterval(interval);
      if (res.status !== "ok") {
        setDemoError((res.message as string) || "Failed to load demo data");
        setDemoLoading(false);
        return false;
      }
      setDemoProgress("Demo data loaded successfully!");
      setDemoComplete(true);
      setDemoLoading(false);
      return true;
    } catch {
      clearInterval(interval);
      setDemoError("Network error while loading demo data");
      setDemoLoading(false);
      return false;
    }
  }

  async function handleNext() {
    if (currentStep === 2) {
      if (!companyCreated) {
        await handleCompanySetup();
      } else {
        goToStep(3);
      }
    } else if (currentStep === 3) {
      goToStep(4);
    } else if (currentStep === 4) {
      if (loadDemoData && !demoComplete) {
        const success = await handleDemoData();
        if (success) {
          goToStep(5);
        }
        // If failed, stay on step 4 so the user sees the error
      } else {
        goToStep(5);
      }
    } else if (currentStep === 5) {
      router.push("/dashboard");
    }
  }

  function handleBack() {
    if (currentStep > 2) {
      goToStep(currentStep - 1);
    }
  }

  function handleSkip() {
    if (currentStep === 4) {
      goToStep(5);
    }
  }

  // Step indicator (shows steps 2-5 as 1-4 visually with overall step 1 being admin)
  function renderStepIndicator() {
    const allSteps = [
      { number: 1, label: "Admin" },
      ...STEPS,
    ];
    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {allSteps.map((step, idx) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;
          return (
            <div key={step.number} className="flex items-center gap-2">
              {idx > 0 && (
                <div
                  className={`h-px w-6 sm:w-10 transition-colors duration-300 ${
                    step.number <= currentStep
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`text-[10px] hidden sm:block ${
                    isCurrent
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Company Setup</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your company details
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              type="text"
              placeholder="Acme Corporation"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={companyCreated}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={currency}
              onValueChange={setCurrency}
              disabled={companyCreated}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fiscalMonth">Fiscal Year Start Month</Label>
            <Select
              value={fiscalMonth}
              onValueChange={setFiscalMonth}
              disabled={companyCreated}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {companyCreated && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-400">
              <Check className="h-4 w-4" />
              Company created successfully
            </div>
          )}

          {companyError && (
            <p className="text-sm text-destructive">{companyError}</p>
          )}
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Installed Modules</h3>
          <p className="text-sm text-muted-foreground mt-1">
            These modules are ready to use
          </p>
        </div>

        {skillsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {skills
              .filter(
                (s) => s.name !== "erpclaw-web" && s.name !== "webclaw"
              )
              .map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  <span className="text-sm truncate">
                    {skillDisplayName(skill.name, skills)}
                  </span>
                </div>
              ))}
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground">
          {skills.filter(
            (s) => s.name !== "erpclaw-web" && s.name !== "webclaw"
          ).length}{" "}
          modules installed
        </div>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Demo Data</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Load Stark Manufacturing sample data?
          </p>
        </div>

        {demoLoading ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground animate-pulse">
              {demoProgress}
            </p>
          </div>
        ) : demoComplete ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/50">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Demo data loaded successfully!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Card
              className={`cursor-pointer transition-all ${
                loadDemoData
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() => setLoadDemoData(true)}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    loadDemoData
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {loadDemoData && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Yes, load demo data
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Includes sample customers, suppliers, items, transactions,
                    and financial data for Stark Manufacturing.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition-all ${
                !loadDemoData
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() => setLoadDemoData(false)}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    !loadDemoData
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {!loadDemoData && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">
                    No, start with a clean slate
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Begin with an empty database. You can always load demo data
                    later from the dashboard.
                  </p>
                </div>
              </CardContent>
            </Card>

            {demoError && (
              <p className="text-sm text-destructive">{demoError}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/50">
            <PartyPopper className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold">Setup Complete!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your ERP system is ready to use
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configuration Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Administrator</span>
              <span className="font-medium">{adminName || adminEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{adminEmail}</span>
            </div>
            {companyName && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <span className="font-medium">{companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Currency</span>
                  <Badge variant="secondary">{currency}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Fiscal Year Start
                  </span>
                  <span className="font-medium">
                    {MONTHS.find((m) => m.value === fiscalMonth)?.label}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modules</span>
              <span className="font-medium">
                {skills.filter(
                  (s) => s.name !== "erpclaw-web" && s.name !== "webclaw"
                ).length}{" "}
                installed
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Demo Data</span>
              <Badge variant={demoComplete ? "default" : demoError ? "destructive" : "secondary"}>
                {demoComplete ? "Loaded" : demoError ? "Failed" : "Skipped"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stepContent: Record<number, () => React.ReactNode> = {
    2: renderStep2,
    3: renderStep3,
    4: renderStep4,
    5: renderStep5,
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {renderStepIndicator()}

        <Card>
          <CardContent className="p-6">
            {/* Animated step content */}
            <div
              className={`transition-all duration-200 ${
                animating
                  ? direction === "forward"
                    ? "opacity-0 translate-x-4"
                    : "opacity-0 -translate-x-4"
                  : "opacity-100 translate-x-0"
              }`}
            >
              {stepContent[currentStep]?.()}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 2 || demoLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              <div className="flex gap-2">
                {currentStep === 4 && !demoLoading && !demoComplete && (
                  <Button variant="ghost" onClick={handleSkip}>
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip
                  </Button>
                )}

                <Button
                  onClick={handleNext}
                  disabled={
                    companySubmitting ||
                    demoLoading ||
                    (currentStep === 2 &&
                      !companyCreated &&
                      !companyName.trim())
                  }
                >
                  {companySubmitting || demoLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      {companySubmitting
                        ? "Creating..."
                        : "Loading..."}
                    </>
                  ) : currentStep === 5 ? (
                    <>
                      Go to Dashboard
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : currentStep === 2 && companyCreated ? (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : currentStep === 4 && loadDemoData ? (
                    <>
                      Load Demo Data
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
