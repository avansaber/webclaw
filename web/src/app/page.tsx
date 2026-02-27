"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  Zap,
  ArrowRight,
  Layout,
  Table2,
  MessageSquare,
  Link2,
  Radio,
  Shield,
  Terminal,
  Layers,
  Sparkles,
  ChevronRight,
  Github,
} from "lucide-react";

const features = [
  {
    icon: Layout,
    title: "Zero-Config Forms",
    description:
      "Define actions in SKILL.md. Forms appear automatically with typed fields, validation, and entity lookups.",
  },
  {
    icon: Table2,
    title: "Smart Data Tables",
    description:
      "Column types inferred from data. Currencies formatted, dates localised, statuses colour-coded.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat Panel",
    description:
      "Ask questions, resolve entities, and execute actions through natural language, right alongside your data.",
  },
  {
    icon: Link2,
    title: "Cross-Skill Lookups",
    description:
      "Reference customers, items, accounts, and employees across different skills seamlessly.",
  },
  {
    icon: Radio,
    title: "Real-Time Updates",
    description:
      "Server-sent events power live notifications, data refresh, and connection status indicators.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description:
      "JWT authentication, RBAC middleware, and audit logging built in. Every action is verified and logged.",
  },
];

const steps = [
  {
    number: "01",
    title: "Install Webclaw",
    description: "Clone the repo and run the install script on your OpenClaw server. Takes under 5 minutes.",
  },
  {
    number: "02",
    title: "Skills Appear Automatically",
    description: "Every skill with a SKILL.md file shows up in the sidebar, grouped by category.",
  },
  {
    number: "03",
    title: "Forms, Tables, Dashboards",
    description:
      "Action parameters become form fields. List responses become data tables. Status responses become KPI cards. Zero custom code.",
  },
];

const stats = [
  { value: "24", label: "Skills Supported" },
  { value: "570+", label: "Actions Rendered" },
  { value: "4,651", label: "Validation Checks" },
  { value: "0", label: "Per-Action Custom Code" },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render until client-side to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">Webclaw</span>
          </Link>
          <div className="flex items-center gap-3">
            {!loading && user ? (
              <Link href="/dashboard">
                <Button>
                  Go to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link href="/setup">
                  <Button>
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <Badge variant="secondary" className="mb-6 gap-1">
          <Sparkles className="h-3 w-3" />
          Open Source
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          The Universal Web UI
          <br />
          <span className="text-primary">for OpenClaw Skills</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          One interface. Every skill. Zero configuration. Webclaw reads your SKILL.md
          and renders forms, data tables, and dashboards automatically.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          {!loading && user ? (
            <Link href="/dashboard">
              <Button size="lg">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/setup">
                <Button size="lg">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg">
                  Sign In
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">
            Everything Your Skills Need
          </h2>
          <p className="mt-3 text-muted-foreground">
            Schema-driven rendering means your skills get a professional web UI for free.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-0 shadow-none bg-muted/40">
                <CardContent className="pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">
              How It Works
            </h2>
            <p className="mt-3 text-muted-foreground">
              Three steps from installation to a fully rendered web interface.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.number} className="relative">
                <div className="text-5xl font-bold text-primary/15 mb-3">
                  {step.number}
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
                {i < steps.length - 1 && (
                  <ChevronRight className="hidden md:block absolute top-8 -right-4 h-6 w-6 text-muted-foreground/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">
            5-Layer Progressive Architecture
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each layer adds intelligence. Skills work with any subset of layers.
          </p>
        </div>
        <div className="mx-auto max-w-3xl">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <pre className="p-6 text-sm leading-relaxed overflow-x-auto font-mono text-muted-foreground">
{`Layer 4  UI.yaml Override     Hand-crafted or auto-generated    [highest priority]
         ─────────────────────────────────────────────────────
Layer 3  AI Enhancement        Smart labels, field grouping       [async, cached]
         ─────────────────────────────────────────────────────
Layer 2  Response Introspect   Call list/status, infer schema     [runtime]
         ─────────────────────────────────────────────────────
Layer 1  Markdown Tables       Parse flag tables from SKILL.md    [static]
         ─────────────────────────────────────────────────────
Layer 0  YAML Body             Parse body: arrays from frontmatter [static]`}
              </pre>
            </CardContent>
          </Card>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            A skill with only SKILL.md (no UI.yaml) still gets working forms, tables, and navigation.
          </p>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Next.js 16
            </span>
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" /> FastAPI
            </span>
            <span className="flex items-center gap-2">
              <Layout className="h-4 w-4" /> shadcn/ui
            </span>
            <span className="flex items-center gap-2">
              <Table2 className="h-4 w-4" /> TanStack Table
            </span>
            <span className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Claude AI
            </span>
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> SQLite
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <span className="font-semibold">Webclaw</span>
              <span className="text-sm text-muted-foreground">
                by AvanSaber — built for OpenClaw
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a
                href="https://github.com/avansaber/webclaw"
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
              <Link href="/login" className="hover:text-foreground transition-colors">
                Sign In
              </Link>
              <Link href="/setup" className="hover:text-foreground transition-colors">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
