"use client";

import PageShell, { PageTitle, SubHeading } from "@/components/shell/PageShell";
import { LoadError, Skeleton, useLoad } from "@/components/shared/Load";
import { DEV_MERCHANT, getConnections, type ConnectedApp, type Connections, type KumoRun } from "@/lib/api";
import { dateTime } from "@/lib/format";

/** Which apps each card stands for, in plain words. */
const APP_HINT: Record<ConnectedApp["app"], string> = {
  shopify: "Shopify",
  ads: "Google, Meta or TikTok Ads",
  payments: "Stripe or PayPal",
  support: "Gorgias",
};

const PROVIDER_NAME: Record<string, string> = {
  shopify: "Shopify",
  "google-ads": "Google Ads",
  google_ads: "Google Ads",
  google: "Google Ads",
  "meta-ads": "Meta Ads",
  meta_ads: "Meta Ads",
  meta: "Meta Ads",
  facebook: "Meta Ads",
  "tiktok-ads": "TikTok Ads",
  tiktok_ads: "TikTok Ads",
  tiktok: "TikTok Ads",
  stripe: "Stripe",
  paypal: "PayPal",
  gorgias: "Gorgias",
};

function providerName(p: string): string {
  return PROVIDER_NAME[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1).replace(/[-_]/g, " ");
}

function plainStatus(status: string): { text: string; tone: "ok" | "bad" | "busy" | "plain" } {
  const s = status.toLowerCase();
  if (["ok", "done", "success", "succeeded", "completed", "complete", "finished", "connected", "active", "synced"].includes(s)) return { text: "Working", tone: "ok" };
  if (["failed", "error", "errored", "broken", "disconnected"].includes(s)) return { text: "Failed", tone: "bad" };
  if (["running", "pending", "queued", "started", "syncing", "importing"].includes(s)) return { text: "In progress", tone: "busy" };
  return { text: s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " "), tone: "plain" };
}

const TONE: Record<"ok" | "bad" | "busy" | "plain", string> = {
  ok: "text-[#34d399]",
  bad: "text-[#f87171]",
  busy: "text-[#fbbf24]",
  plain: "text-muted",
};

function lastSync(app: ConnectedApp): string | null {
  const times = app.integrations.map((i) => i.last_sync_at).filter((t): t is string => t !== null);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

function AppCard({ app }: { app: ConnectedApp }) {
  const sync = lastSync(app);
  return (
    <section className="rounded-[10px] border border-white/[0.08] bg-land p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">{app.name}</h3>
        <span className={`text-xs font-semibold ${app.connected ? "text-[#34d399]" : "text-muted"}`}>{app.connected ? "Connected" : "Not connected"}</span>
      </div>
      <div className="text-xs text-muted">{APP_HINT[app.app]}</div>
      <div className="mt-2 text-xs">
        <span className="text-muted">Last sync: </span>
        {sync ? dateTime(sync) : <span className="text-muted">never</span>}
      </div>
      {app.integrations.length > 0 && (
        <ul className="mt-2 border-t border-white/[0.08] pt-2 text-xs">
          {app.integrations.map((i, n) => {
            const st = plainStatus(i.status);
            return (
              <li key={`${i.provider}-${n}`} className="flex justify-between gap-2 py-0.5">
                <span>{providerName(i.provider)}</span>
                <span className={TONE[st.tone]}>{st.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** What a run made, in plain words. Never the model's name. */
function runLabel(run: KumoRun): string {
  switch (run.model.toLowerCase()) {
    case "relational":
      return "Product forecasts, next 14 days";
    case "forecast":
      return "Store-total forecasts";
    case "anomaly":
      return "Alerts";
    default:
      return "Predictions";
  }
}

function KumoCard({ kumo }: { kumo: Connections["kumo"] }) {
  const where = kumo.hosted ? "hosted by NVIDIA" : kumo.local ? "on our server" : "not set up";
  return (
    <section className="rounded-[10px] border border-white/[0.08] bg-land p-3.5">
      <h3 className="font-medium">
        Kumo<span className="source-chip">Kumo</span>
      </h3>
      <div className="mt-1.5 text-xs">
        <span className="text-muted">Forecasts: </span>
        {where}
      </div>
      <div className="mt-0.5 text-xs">
        <span className="text-muted">Store-total forecasts and alerts: </span>
        {kumo.gpu ? "ready" : "need a GPU server"}
      </div>
      <div className="mb-1 mt-3 text-[11px] uppercase tracking-wide text-muted">Last runs</div>
      {kumo.last_runs.length === 0 ? (
        <p className="text-xs text-muted">No runs yet.</p>
      ) : (
        <ul className="text-xs">
          {kumo.last_runs.map((r, n) => {
            const st = plainStatus(r.status);
            return (
              <li key={`${r.query_name}-${n}`} className="flex justify-between gap-3 border-t border-white/[0.08] py-1">
                <span>{runLabel(r)}</span>
                <span className="whitespace-nowrap">
                  <span className={TONE[st.tone]}>{st.text}</span>
                  <span className="ml-2 text-muted">{r.finished_at ? dateTime(r.finished_at) : "not finished"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function ConnectionsPage() {
  const conn = useLoad(() => getConnections(DEV_MERCHANT), `connections:${DEV_MERCHANT}`);
  const c = conn.data;
  return (
    <PageShell crumbs={[{ label: "Connections" }]}>
      <PageTitle title="Connections" sub="The apps The Terminal reads from, and when each last synced." />
      {conn.error ? (
        <LoadError message={conn.error} retry={conn.retry} />
      ) : !c ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {c.apps.map((a) => (
              <AppCard key={a.app} app={a} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Connecting apps comes with the login screen.</p>
          <SubHeading>Forecasts</SubHeading>
          <div className="max-w-xl">
            <KumoCard kumo={c.kumo} />
          </div>
        </>
      )}
    </PageShell>
  );
}
