"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, decodeGithubFileUtf8, getStoredToken } from "@/lib/api";

type StackDoc = {
  version: number;
  repo_full_name: string;
  created_by: string;
  prs: Array<{
    pr_number: number;
    position: number;
    head_branch?: string;
    base_branch?: string;
    status?: string;
  }>;
  resolution_contexts?: Array<{
    user_github_login: string;
    resolution_pr_number: number;
  }>;
};

export default function RepoStackPage() {
  const params = useParams();
  const owner = decodeURIComponent(String(params.owner));
  const repo = decodeURIComponent(String(params.repo));
  const [doc, setDoc] = useState<StackDoc | null>(null);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getStoredToken()) {
      setErr("Set a token first.");
      return;
    }
    (async () => {
      try {
        const enc = [".nugit", "stack.json"].map(encodeURIComponent).join("/");
        const item = (await apiFetch(
          `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${enc}`
        )) as { type?: string; encoding?: string; content?: string };
        const raw = decodeGithubFileUtf8(item);
        if (!raw) {
          setErr("No .nugit/stack.json in default branch (or not a file).");
          return;
        }
        const parsed = JSON.parse(raw) as StackDoc;
        setDoc(parsed);
        const ordered = [...(parsed.prs || [])].sort((a, b) => a.position - b.position);
        const next: Record<number, string> = {};
        for (const p of ordered) {
          try {
            const pr = (await apiFetch(
              `/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${p.pr_number}`
            )) as { title?: string };
            if (pr.title) next[p.pr_number] = pr.title;
          } catch {
            next[p.pr_number] = "(could not load)";
          }
        }
        setTitles(next);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, [owner, repo]);

  return (
    <main>
      <p>
        <Link href="/repos">← Repos</Link>
      </p>
      <h1>
        {owner}/{repo}
      </h1>
      {err ? <p className="muted">{err}</p> : null}
      {doc ? (
        <>
          <p className="muted">
            Stack file <code>.nugit/stack.json</code> — created by {doc.created_by}
          </p>
          <ol style={{ paddingLeft: "1.25rem" }}>
            {[...(doc.prs || [])]
              .sort((a, b) => a.position - b.position)
              .map((p) => (
                <li key={p.pr_number} className="card" style={{ marginBottom: "0.5rem" }}>
                  <strong>#{p.pr_number}</strong> {titles[p.pr_number] || "…"}
                  <div className="muted">
                    {p.head_branch} ← {p.base_branch} ({p.status || "open"})
                  </div>
                </li>
              ))}
          </ol>
          {doc.resolution_contexts?.length ? (
            <div className="card">
              <h3>Resolution contexts</h3>
              <ul>
                {doc.resolution_contexts.map((c) => (
                  <li key={c.user_github_login}>
                    {c.user_github_login} → PR #{c.resolution_pr_number}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
