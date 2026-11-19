import { requireApiUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    { error: "Product angle generation is unavailable in FLOW Free mode because free text and vision models cannot reliably edit an uploaded product reference. No paid image API will be called." },
    { status: 403 },
  );
}
