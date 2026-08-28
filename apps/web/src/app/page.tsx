import { HealthStatus } from "@/components/health-status";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-20">
      <main className="w-full max-w-2xl">
        <span className="text-sm font-semibold uppercase tracking-wide text-accent">
          Phase 0 — Foundation
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Ilays Schools ERP
        </h1>
        <p className="mt-3 text-foreground-soft">
          The platform is scaffolded. Once the API, PostgreSQL, and Redis are running, this
          page will confirm the connection is live.
        </p>

        <div className="mt-8">
          <HealthStatus />
        </div>
      </main>
    </div>
  );
}
