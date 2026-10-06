"use client";

import { useEffect, useState } from "react";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { pushPublicKey, registerPush, testPush, unregisterPush } from "@/lib/sync/engine";
import { useUI } from "./ui-context";
import { useSyncState } from "./use-sync";

function toUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }

  return out;
}

type Support = "checking" | "ok" | "no-sw" | "ios-install" | "unsupported";

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

/** Web Push on this device (works with the app closed; needs sync). */
export function PushSettings() {
  const ui = useUI();
  const sync = useSyncState();
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("PushManager" in window) || !("Notification" in window)) {
        setSupport(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }

      const reg = await registration();
      if (!reg) {
        setSupport("no-sw");
        return;
      }

      setSupport("ok");
      setSubscribed(Boolean(await reg.pushManager.getSubscription()));
    })();
  }, []);

  if (!sync.session) {
    return (
      <p className="text-xs text-muted-foreground">
        Para receber avisos com o app fechado, ative a sincronização (o servidor é quem envia os avisos).
      </p>
    );
  }

  if (support === "checking") {
    return null;
  }

  if (support !== "ok") {
    const text =
      support === "ios-install"
        ? "No iPhone, instale o app na Tela de Início (Compartilhar → Adicionar à Tela de Início) para receber avisos com ele fechado."
        : support === "no-sw"
          ? "Avisos com o app fechado ficam disponíveis na versão publicada (não no modo de desenvolvimento)."
          : "Este navegador não suporta avisos com o app fechado.";
    return <p className="text-xs text-muted-foreground">{text}</p>;
  }

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const reg = await registration();
      if (!reg) {
        throw new Error("Service worker indisponível");
      }

      if (on) {
        if ((await Notification.requestPermission()) !== "granted") {
          throw new Error("Permissão de notificação negada");
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8(await pushPublicKey()),
        });
        await registerPush(sub.endpoint);
        setSubscribed(true);
        ui.toast("Avisos com o app fechado ativados");
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unregisterPush(sub.endpoint);
          await sub.unsubscribe();
        }

        setSubscribed(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="flex items-center gap-1.5 text-sm">
            <BellRing className="h-3.5 w-3.5" /> Avisar com o app fechado
          </span>
          <span className="block text-xs text-muted-foreground">Notificação do sistema, enviada pelo servidor.</span>
        </span>
        <Switch checked={subscribed} disabled={busy} onCheckedChange={(v) => void toggle(v)} />
      </label>
      {subscribed && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() =>
            void testPush()
              .then((n) => ui.toast(n ? "Teste enviado — feche o app para ver" : "Nenhuma inscrição ativa"))
              .catch((err: Error) => setError(err.message))
          }
        >
          <Send className="h-3.5 w-3.5" /> Enviar teste
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
