import { PageHeader } from "@/components/common/page-header";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { ClientsList } from "@/components/clients/clients-list";
import { listClients } from "@/server/data/clients";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <>
      <PageHeader title="Clients" description="People and companies you work with." actions={<ClientFormDialog />} />
      <ClientsList
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          email: c.email,
          defaultCurrency: c.defaultCurrency,
          projectCount: c.projectCount,
          archived: Boolean(c.archivedAt),
        }))}
      />
    </>
  );
}
