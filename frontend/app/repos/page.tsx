"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getStoredToken } from "@/lib/api";

type GhRepo = {
  full_name?: string;
  name?: string;
  owner?: { login?: string };
  html_url?: string;
};

export default function ReposPage() {
  const [repos, setRepos] = useState<GhRepo[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getStoredToken()) {
      setErr("Set a token on the Token page first.");
      return;
    }
    (async () => {
      try {
        const data = (await apiFetch("/github/user/repos?per_page=50&page=1")) as GhRepo[];
        setRepos(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  return (
    <main>
      <h1>Your repositories</h1>
      {err ? <p className="muted">{err}</p> : null}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {repos.map((r) => {
          const fn = r.full_name || "";
          const [o, n] = fn.split("/");
          if (!o || !n) return null;
          return (
            <li key={fn} className="card">
              <Link href={`/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}`}>
                {fn}
              </Link>
              {r.html_url ? (
                <div className="muted" style={{ marginTop: "0.25rem" }}>
                  <a href={r.html_url} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
