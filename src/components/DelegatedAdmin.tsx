"use client";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { useTranslation } from "@/lib/locale";
export default function DelegatedAdmin({
  data,
  run,
  reload,
}: {
  data: any;
  run: (fn: () => Promise<any>) => Promise<any>;
  reload: () => Promise<void>;
}) {
  const tr = useTranslation();
  return (
    <>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>
          {data.role === "moderator"
            ? "Moderator access: managed media review and appeals. Vault content is excluded."
            : "Support access: user-submitted appeals only. Owner operations and private media are excluded."}
        </p>
      </div>
      {data.role === "moderator" ? (
        <section className="panel p-4 mb-4">
          <h2>Managed media review</h2>
          {data.managedMedia.map((m: any) => (
            <div className="setting-row" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <video
                  src={`/api/v1/admin/managed/${m.id}`}
                  controls
                  preload="none"
                  style={{
                    width: "100%",
                    maxWidth: 420,
                    display: "block",
                    marginTop: 12,
                  }}
                />
              </div>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() =>
                  run(async () => {
                    await api("admin/moderate", "POST", { id: m.id });
                    await reload();
                  })
                }
              >
                Remove managed media
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <section className="panel p-4">
        <h2>{tr("Appeals")}</h2>
        {data.appeals.length ? (
          data.appeals.map((a: any) => (
            <div key={a.id} className="setting-row">
              <div>
                <p>{a.message}</p>
                <small>{a.status}</small>
              </div>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={() =>
                  run(async () => {
                    await api("admin/appeal", "PATCH", {
                      id: a.id,
                      status: "resolved",
                    });
                    await reload();
                  })
                }
              >
                Resolve
              </button>
              <button
                className="subtle-button"
                onClick={() =>
                  run(async () => {
                    await api("admin/appeal", "PATCH", {
                      id: a.id,
                      status: "rejected",
                    });
                    await reload();
                  })
                }
              >
                {tr("Reject")}
              </button>
            </div>
          ))
        ) : (
          <p>{tr("No appeals yet.")}</p>
        )}
      </section>
    </>
  );
}
