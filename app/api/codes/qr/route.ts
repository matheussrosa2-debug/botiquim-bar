import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });
  const png = await QRCode.toBuffer(code, { type: "png", width: 300, margin: 2 });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
