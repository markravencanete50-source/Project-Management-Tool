import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { todayIso } from "@/lib/dates";
import { exportAll, expensesCsv, paymentsCsv, tasksCsv, timeEntriesCsv } from "@/server/export";

export const dynamic = "force-dynamic";

/**
 * GET /api/export?format=json|csv|time|tasks|expenses. Admin only (401 otherwise).
 * json is the full export. csv is one flat file of payments joined with the
 * project title, client name and currency. time is the retainer time log and
 * tasks is the priced task list and expenses is every expense (recurring repeats included and
 * flagged as derived), each as a flat CSV.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv" && format !== "time" && format !== "tasks" && format !== "expenses") return new NextResponse("Unknown format", { status: 400 });

  const data = await exportAll();
  const date = todayIso();

  if (format !== "json") {
    const csv = {
      csv: { body: paymentsCsv, name: "payments" },
      time: { body: timeEntriesCsv, name: "time-log" },
      tasks: { body: tasksCsv, name: "tasks" },
      expenses: { body: (d: Awaited<ReturnType<typeof exportAll>>) => expensesCsv(d), name: "expenses" },
    }[format];
    return new NextResponse(csv.body(data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csv.name}-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
