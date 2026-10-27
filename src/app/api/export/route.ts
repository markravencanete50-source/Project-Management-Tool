import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { todayIso } from "@/lib/dates";
import { exportAll, paymentsCsv } from "@/server/export";

export const dynamic = "force-dynamic";

/**
 * GET /api/export?format=json|csv. Admin only (401 otherwise).
 * json is the full export. csv is one flat file of payments joined with the
 * project title, client name and currency.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return new NextResponse("Unknown format", { status: 400 });

  const data = await exportAll();
  const date = todayIso();

  if (format === "csv") {
    return new NextResponse(paymentsCsv(data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payments-${date}.csv"`,
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
