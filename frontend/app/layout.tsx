import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nugit — stacked PRs",
  description: "Web UI for repos using .nugit stack files"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: "1px solid #30363d",
            padding: "0.75rem 1.5rem",
            display: "flex",
            gap: "1rem",
            alignItems: "center"
          }}
        >
          <strong>Nugit</strong>
          <a href="/">Home</a>
          <a href="/login">Token</a>
          <a href="/repos">Repos</a>
        </header>
        {children}
      </body>
    </html>
  );
}
