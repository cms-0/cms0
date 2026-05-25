import pg from "pg";
import { NextResponse } from "next/server";

import { getDatabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const pool = new pg.Pool({
    connectionString: getDatabaseUrl(),
    max: 1,
  });

  try {
    await pool.query("select 1");
    return NextResponse.json(
      {
        ok: true,
        service: "cms0-admin",
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "cms0-admin",
      },
      { status: 503 },
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
