import { Download } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { BackupsList } from "@/components/settings/backups-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_AGREEMENT_TEMPLATE } from "@/lib/pdf/default-template";
import { getSettings } from "@/server/data/settings";
import { listBackups } from "@/server/export";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  // A failed Cloudinary call should not take the whole settings page down.
  const backups = await listBackups().then(
    (items) => ({ items, failed: false }),
    () => ({ items: [], failed: true }),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Business details, project defaults, the agreement template and your data." />

      <div className="space-y-6">
        <SettingsForm
          initial={{
            acceptedRule: settings.acceptedRule,
            defaultRevisionAllowance: settings.defaultRevisionAllowance,
            businessName: settings.businessName,
            businessEmail: settings.businessEmail,
            agreementTemplate: settings.agreementTemplate,
          }}
          defaultTemplate={DEFAULT_AGREEMENT_TEMPLATE}
        />

        <Card>
          <CardHeader>
            <CardTitle>Export all data</CardTitle>
            <CardDescription>
              JSON holds everything: clients, prospects, projects with milestones, schedule, payments, agreements and revisions, activity and settings.
              CSV is a single file of every payment with its project, client and currency.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" render={<a href="/api/export?format=json" download />}>
              <Download data-icon="inline-start" />
              Download JSON
            </Button>
            <Button variant="outline" render={<a href="/api/export?format=csv" download />}>
              <Download data-icon="inline-start" />
              Download payments CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backups</CardTitle>
            <CardDescription>A full JSON backup is saved every day at 08:00 Manila time. The latest 30 are kept.</CardDescription>
          </CardHeader>
          <CardContent>
            <BackupsList backups={backups.items} failed={backups.failed} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
