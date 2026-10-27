import { PageHeader } from "@/components/common/page-header";
import { NewProspectDialog } from "@/components/prospects/new-prospect-dialog";
import { ProspectsView } from "@/components/prospects/prospects-view";
import { listProspects } from "@/server/data/prospects";
import { todayIso } from "@/lib/dates";
import { PROSPECT_SOURCES, PROSPECT_STAGES } from "@/lib/types";

export const metadata = { title: "Prospects" };

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ProspectsPage({ searchParams }: PageProps<"/admin/prospects">) {
  const sp = await searchParams;
  const view = one(sp.view) === "kanban" ? "kanban" : "table";
  const stageParam = one(sp.stage);
  const sourceParam = one(sp.source);
  const stage = (PROSPECT_STAGES as readonly string[]).includes(stageParam) ? stageParam : "all";
  const source = (PROSPECT_SOURCES as readonly string[]).includes(sourceParam) ? sourceParam : "all";
  const showArchived = one(sp.archived) === "1";

  const all = await listProspects();
  const visible = all.filter(
    (p) =>
      (showArchived || !p.archivedAt) &&
      (stage === "all" || p.stage === stage) &&
      (source === "all" || p.source === source),
  );

  return (
    <div className="min-w-0 max-w-full">
      <PageHeader
        title="Prospects"
        description="People you are talking to about work."
        actions={all.length > 0 ? <NewProspectDialog /> : undefined}
      />
      <ProspectsView
        prospects={visible}
        view={view}
        stage={stage}
        source={source}
        showArchived={showArchived}
        today={todayIso()}
        hasAny={all.some((p) => showArchived || !p.archivedAt)}
      />
    </div>
  );
}
