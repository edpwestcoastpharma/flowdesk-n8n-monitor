# FlowDesk Deployment

## GitHub

1. Create a new GitHub repository.
2. Push this folder to that repository.
3. Do not commit private API keys.

## Vercel

1. Import the GitHub repository in Vercel.
2. Framework preset: Other.
3. Build command: leave empty.
4. Output directory: `public`.
5. Add Environment Variables:

```text
N8N_BASE_URL=https://your-n8n-ngrok-or-domain
N8N_API_KEY=your_n8n_api_key
```

Use only the n8n base URL. Do not add `/home/workflows` or `/api/v1`.

Correct:

```text
https://objurgatory-chitinoid-saran.ngrok-free.dev
```

Wrong:

```text
https://objurgatory-chitinoid-saran.ngrok-free.dev/home/workflows
```

## Important

The local version can save connection settings and metadata into JSON files.
Vercel serverless functions cannot reliably save local JSON files.

On Vercel:

- n8n connection uses environment variables.
- Workflow/client notes need a real database such as Supabase.
- Do not make the Vercel URL public until login/auth is added.
