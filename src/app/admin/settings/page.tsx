import { DatabaseBackup, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsSection } from "@/components/settings/settings-section";
import { BackupsList } from "@/components/settings/backups-list";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_AGREEMENT_TEMPLATE } from "@/lib/pdf/default-template";
import { sourceLabel } from "@/lib/fx/convert";
import { loadLiveRates } from "@/server/data/fx";
import { getSettings } from "@/server/data/settings";
import { listBackups } from "@/server/export";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  // Live rates are only a hint beside the manual inputs; a failure just hides the hint.
  const live = await loadLiveRates(["USD", "GBP"]).catch(() => null);
  const liveRates = Object.fromEntries(
    (live?.quotes ?? []).map((q) => [q.currency, { rate: q.rate.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), raw: q.rate, label: sourceLabel(q.source) }]),
  );
  // A failed Cloudinary call should not take the whole settings page down.
  const backups = await listBackups().then(
    (items) => ({ items, failed: false }),
    () => ({ items: [], failed: true }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Business details, project defaults, the agreement template and your data." />

      <div className="flex flex-col gap-6">
        <SettingsForm
          initial={{
            acceptedRule: settings.acceptedRule,
            defaultRevisionAllowance: settings.defaultRevisionAllowance,
            businessName: settings.businessName,
            businessEmail: settings.businessEmail,
            agreementTemplate: settings.agreementTemplate,
            fxOverrides: { USD: settings.fxOverrides.USD ?? null, GBP: settings.fxOverrides.GBP ?? null },
            openingBalances: {
              GBP: settings.openingBalances.GBP ?? null,
              USD: settings.openingBalances.USD ?? null,
              PHP: settings.openingBalances.PHP ?? null,
            },
            openingBalanceDate: settings.openingBalanceDate,
          }}
          liveRates={liveRates}
          defaultTemplate={DEFAULT_AGREEMENT_TEMPLATE}
        />

        <SettingsSection icon={<Download />} title="Export all data" description="Take a copy of your records whenever you need one.">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <FileJson className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 text-sm text-muted-foreground">
                  <span className="block font-medium text-foreground">Everything as JSON</span>
                  Clients, prospects, projects with milestones, schedule, payments, agreements, revisions, time entries and tasks, payment-only entries, expenses, activity and settings.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" render={<a href="/api/export?format=json" download />}>
                <Download data-icon="inline-start" />
                Download JSON
              </Button>
            </li>
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 text-sm text-muted-foreground">
                  <span className="block font-medium text-foreground">Payments as CSV</span>
                  A single file of every payment with its project, client and currency.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" render={<a href="/api/export?format=csv" download />}>
                <Download data-icon="inline-start" />
                Download payments CSV
              </Button>
            </li>
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 text-sm text-muted-foreground">
                  <span className="block font-medium text-foreground">Time log as CSV</span>
                  Every retainer time entry with its rate and value.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" render={<a href="/api/export?format=time" download />}>
                <Download data-icon="inline-start" />
                Download time CSV
              </Button>
            </li>
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 text-sm text-muted-foreground">
                  <span className="block font-medium text-foreground">Expenses as CSV</span>
                  Every expense, with each repeat of a recurring expense on its own row marked as derived.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" render={<a href="/api/export?format=expenses" download />}>
                <Download data-icon="inline-start" />
                Download expenses CSV
              </Button>
            </li>
            <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 text-sm text-muted-foreground">
                  <span className="block font-medium text-foreground">Tasks as CSV</span>
                  Every priced task with its status and price.
                </p>
              </div>
              <Button variant="outline" className="shrink-0" render={<a href="/api/export?format=tasks" download />}>
                <Download data-icon="inline-start" />
                Download tasks CSV
              </Button>
            </li>
          </ul>
        </SettingsSection>

        <SettingsSection
          icon={<DatabaseBackup />}
          title="Backups"
          description="A full JSON backup is saved every day at 08:00 Manila time. The latest 30 are kept."
        >
          <BackupsList backups={backups.items} failed={backups.failed} />
        </SettingsSection>
      </div>
    </div>
  );
}
