# Cron Trigger Setup (Vercel + Eazee)

This project dispatches scheduled WhatsApp jobs via:

- `GET /api/whatsapp/dispatch-due` for Vercel cron triggers
- `POST /api/whatsapp/dispatch-due` for manual dispatch calls

## 1) Required environment variable

Set this in `frontend/.env.local` (local) and Vercel Project Settings (production):

```env
CRON_SECRET=your_strong_random_secret
```

The route validates:

```http
Authorization: Bearer <CRON_SECRET>
```

## 2) Vercel cron config

`vercel.json` already includes:

```json
{
  "crons": [
    {
      "path": "/api/whatsapp/dispatch-due",
      "schedule": "0 9 * * *"
    }
  ]
}
```

This runs once daily at 09:00 UTC (Hobby-compatible).

If you need sub-daily dispatch in production:

- Upgrade to Vercel Pro and use a more frequent cron expression, or
- Use an external scheduler (GitHub Actions, cron-job.org, etc.) to call `POST /api/whatsapp/dispatch-due` with `Authorization: Bearer <CRON_SECRET>`.

## 3) Why GET is used for cron

Vercel cron invokes the configured path on a schedule; this route now dispatches due jobs when the request is identified as a cron trigger (`x-vercel-cron` header present).

Manual `GET` without cron headers still returns queue status for debugging.

## 4) Local/manual testing

### Trigger dispatch manually

```bash
curl -X POST http://localhost:3000/api/whatsapp/dispatch-due \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### View queue status

```bash
curl http://localhost:3000/api/whatsapp/dispatch-due
```

## 5) Common issues

- **401 Unauthorized**: `CRON_SECRET` mismatch between request and environment.
- **No messages sent**: no due jobs in queue, or jobs have targets without `recipient` mapping.
- **Cron runs but no dispatch**: confirm Vercel project is deployed with the latest `vercel.json` and env vars.
