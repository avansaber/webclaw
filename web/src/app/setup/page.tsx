"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { setAccessToken } from "@/lib/auth";

const APP_TITLE = process.env.NEXT_PUBLIC_OCUI_TITLE || "Webclaw";

type SetupPhase = "checking" | "admin" | "wizard";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<SetupPhase>("checking");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/v1/auth/check-setup")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needs_setup) {
          router.replace("/login");
        } else {
          setPhase("admin");
        }
      })
      .catch(() => setPhase("admin"));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // Step 1: Create admin account
      const setupRes = await fetch("/api/v1/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const setupData = await setupRes.json();
      if (setupData.status !== "ok") {
        setError(setupData.message || "Setup failed");
        setSubmitting(false);
        return;
      }

      // Step 2: Auto-login with the new admin credentials
      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (loginData.status !== "ok") {
        // Admin was created but login failed — redirect to login page
        router.push("/login");
        return;
      }

      // Store access token in memory for fetchApi to use immediately
      if (loginData.access_token) {
        setAccessToken(loginData.access_token);
      }

      setSubmitting(false);
      // Transition to the onboarding wizard (steps 2-5)
      setPhase("wizard");
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  }

  // Loading state while checking setup status
  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // After admin creation: show the onboarding wizard (steps 2-5)
  if (phase === "wizard") {
    return (
      <OnboardingWizard
        adminName={fullName}
        adminEmail={email}
      />
    );
  }

  // Step 1: Admin account creation form
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Step indicator showing step 1 of 5 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[
            { number: 1, label: "Admin" },
            { number: 2, label: "Company" },
            { number: 3, label: "Modules" },
            { number: 4, label: "Demo Data" },
            { number: 5, label: "Complete" },
          ].map((step, idx) => (
            <div key={step.number} className="flex items-center gap-2">
              {idx > 0 && (
                <div
                  className={`h-px w-6 sm:w-10 transition-colors duration-300 ${
                    step.number <= 1
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                    step.number === 1
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.number}
                </div>
                <span
                  className={`text-[10px] hidden sm:block ${
                    step.number === 1
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        <Card className="w-full max-w-sm mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">{APP_TITLE} Setup</CardTitle>
            <CardDescription>
              Create your administrator account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Creating account..." : "Create Admin Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
