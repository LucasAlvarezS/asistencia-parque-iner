// Envío de notificaciones Web Push (solo servidor). Las suscripciones viven en
// public.push_suscripciones (una por dispositivo); las vencidas (404/410: el
// usuario desinstaló la app o iOS invalidó la suscripción) se borran solas.
//
// Claves VAPID: NEXT_PUBLIC_VAPID_PUBLIC_KEY (también la usa el cliente al
// suscribirse), VAPID_PRIVATE_KEY y VAPID_SUBJECT (mailto: o https:).

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AvisoPush {
  title: string;
  body: string;
  tag?: string; // mismo tag reemplaza la notificación anterior en vez de apilarla
  url?: string; // a dónde lleva el toque (default "/")
}

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configurado = true;
  return true;
}

/** Envía el aviso a todos los dispositivos suscritos de los técnicos dados. */
export async function enviarAviso(
  tecnicoIds: string[],
  aviso: AvisoPush,
): Promise<{ enviados: number; fallidos: number; vencidos: number }> {
  const res = { enviados: 0, fallidos: 0, vencidos: 0 };
  if (tecnicoIds.length === 0) return res;
  if (!configurar()) throw new Error("vapid-no-configurado");

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("push_suscripciones")
    .select("endpoint, p256dh, auth")
    .in("tecnico_id", tecnicoIds);
  if (error) throw error;

  const payload = JSON.stringify(aviso);
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: "high" },
        );
        res.enviados++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          res.vencidos++;
          await admin.from("push_suscripciones").delete().eq("endpoint", s.endpoint);
        } else {
          res.fallidos++;
          console.error("[push] envío fallido", status, (err as Error).message);
        }
      }
    }),
  );
  return res;
}
