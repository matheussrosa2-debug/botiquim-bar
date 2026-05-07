import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file     = formData.get("file") as File | null;
  const prizeId  = formData.get("prize_id") as string | null;

  if (!file)    return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });
  if (!prizeId) return NextResponse.json({ error: "ID do prêmio obrigatório" }, { status: 400 });

  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(file.type)) {
    return NextResponse.json({ error: "Formato inválido. Use JPG, PNG, WEBP ou GIF." }, { status: 400 });
  }

  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Imagem muito grande. Máximo 2MB." }, { status: 400 });
  }

  const ext      = file.name.split(".").pop() || "jpg";
  const fileName = `prizes/${prizeId}.${ext}`;
  const buffer   = await file.arrayBuffer();

  const db = supabaseAdmin();

  // Upload to Supabase Storage
  const { error: uploadError } = await db.storage
    .from("prize-images")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true, // overwrite if exists
    });

  if (uploadError) {
    // Try creating the bucket if it doesn't exist
    if (uploadError.message?.includes("bucket") || uploadError.message?.includes("not found")) {
      const { error: bucketError } = await db.storage.createBucket("prize-images", { public: true });
      if (!bucketError) {
        const { error: retryError } = await db.storage
          .from("prize-images")
          .upload(fileName, buffer, { contentType: file.type, upsert: true });
        if (retryError) return NextResponse.json({ error: "Erro ao fazer upload da imagem." }, { status: 500 });
      } else {
        return NextResponse.json({ error: "Erro ao criar bucket de imagens. Verifique as configurações do Supabase." }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Erro ao fazer upload: " + uploadError.message }, { status: 500 });
    }
  }

  // Get public URL
  const { data: { publicUrl } } = db.storage.from("prize-images").getPublicUrl(fileName);

  // Update prize with image URL
  const { error: updateError } = await db
    .from("prizes")
    .update({ image_url: publicUrl })
    .eq("id", prizeId);

  if (updateError) return NextResponse.json({ error: "Imagem salva, mas erro ao atualizar prêmio." }, { status: 500 });

  return NextResponse.json({ ok: true, url: publicUrl });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const prizeId = req.nextUrl.searchParams.get("prize_id");
  if (!prizeId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const db = supabaseAdmin();

  // Remove from storage (try both common extensions)
  for (const ext of ["jpg", "png", "webp", "gif"]) {
    await db.storage.from("prize-images").remove([`prizes/${prizeId}.${ext}`]).catch(() => {});
  }

  // Clear URL from prize
  await db.from("prizes").update({ image_url: null }).eq("id", prizeId);

  return NextResponse.json({ ok: true });
}
