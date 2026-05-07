import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import QRCode from "qrcode";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const { data: event } = await supabaseAdmin()
    .from("events")
    .select("slug, name, qr_color, qr_bg_color")
    .eq("id", id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  const sizeParam = req.nextUrl.searchParams.get("size") || "600";
  const size = Math.min(Math.max(parseInt(sizeParam), 200), 1200);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const url = `${baseUrl}/?event=${event.slug || id}`;

  const png = await QRCode.toBuffer(url, {
    type: "png", width: size, margin: 2,
    color: { dark: event.qr_color || "#000000", light: event.qr_bg_color || "#FFFFFF" },
  });

  const filename = `qr-${event.slug || id}-${size}px.png`;
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
