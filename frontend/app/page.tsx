import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Stacked PRs (local-first)</h1>
      <p className="muted">
        Stack order lives in <code>.nugit/stack.json</code> in your repository. This app talks to
        the Nugit API to list repos and load that file from GitHub.
      </p>
      <p>
        <Link href="/login">Set GitHub token</Link> (stored in this browser only), then{" "}
        <Link href="/repos">open Repos</Link>.
      </p>
    </main>
  );
}
