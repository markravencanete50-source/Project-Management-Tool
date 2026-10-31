import type { ReactNode } from "react";
import { FileSignature, Layers, Receipt, Target, UsersRound } from "lucide-react";
import { ThemeToggle } from "@/components/shell/theme-toggle";

const POINTS = [
  { icon: Target, text: "Track prospects from first contact to signed project" },
  { icon: FileSignature, text: "Send agreements and collect signed copies online" },
  { icon: Receipt, text: "See paid, pending and overdue payments at a glance" },
  { icon: UsersRound, text: "Give every client a private portal for progress and revisions" },
];

/**
 * Two column sign-in frame: brand panel on large screens, form on the right.
 * Server component; the only client leaf is the theme toggle.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-48 size-[30rem] rounded-full bg-chart-2/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.3_0.12_277/0.4),inset_0_1px_0_oklch(1_0_0/0.2)]">
            <Layers className="size-[18px]" />
          </span>
          <span className="text-base font-semibold tracking-tight">Project Tracker</span>
        </div>

        <div className="relative max-w-lg">
          <h2 className="enter text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
            Every client project, in one calm place.
          </h2>
          <ul className="stagger mt-8 grid gap-4 [--stagger:70ms]">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[0.9375rem] text-muted-foreground">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-card text-primary shadow-xs ring-1 ring-border">
                  <Icon className="size-4" />
                </span>
                <span className="pt-0.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">Private workspace. Access is by invitation only.</p>
      </aside>

      <main className="relative flex min-w-0 flex-col justify-center px-4 py-12 sm:px-8">
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
          <ThemeToggle />
        </div>
        <div className="enter mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.3_0.12_277/0.4),inset_0_1px_0_oklch(1_0_0/0.2)]">
              <Layers className="size-[18px]" />
            </span>
            <span className="text-base font-semibold tracking-tight">Project Tracker</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
