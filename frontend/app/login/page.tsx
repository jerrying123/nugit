"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setStoredToken, getStoredToken, clearStoredToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [pat, setPat] = useState("");
  const [status, setStatus] = useState("");

  async function validateAndSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Checking…");
    try {
      const res = (await apiFetch("/auth/pat", {
        method: "POST",
        body: JSON.stringify({ token: pat.trim() })
      })) as { access_token?: string };
      const tok = res.access_token || pat.trim();
      setStoredToken(tok);
      await apiFetch("/auth/me");
      setStatus("Saved. Token is stored in this browser only.");
      router.push("/repos");
    } catch (err) {
      setStatus(String(err));
    }
  }

  return (
    <main>
      <h1>GitHub token</h1>
      <p className="muted">
        The API does not store your token. It is kept in <code>localStorage</code> for this origin
        only and sent as <code>Authorization: Bearer</code> to your Nugit backend.
      </p>
      {getStoredToken() ? (
        <p>
          A token is already saved.{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              clearStoredToken();
              setStatus("Cleared.");
            }}
          >
            Clear
          </button>
        </p>
      ) : null}
      <form onSubmit={validateAndSave}>
        <label>
          Personal access token
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_…"
            autoComplete="off"
          />
        </label>
        <button type="submit">Save &amp; continue</button>
      </form>
      {status ? <p className="muted">{status}</p> : null}
    </main>
  );
}
