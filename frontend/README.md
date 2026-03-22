# Nugit web UI

Next.js app that uses the FastAPI backend as a GitHub proxy. Stack data is read from `.nugit/stack.json` in each repository.

## Setup

```bash
npm install
cp .env.local.example .env.local   # optional
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set your GitHub PAT on **Token** (stored in `localStorage` only).

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:3001/api`.

## Production note

Run the API with CORS updated to include your web origin, or place both behind the same host.
