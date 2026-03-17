# WhatsApp Cloud Credentials Guide (Eazee)

This guide is aligned with Eazee routes and Meta WhatsApp Cloud API flow (Context7-backed).

## Security first

- Do not commit WhatsApp tokens to git.
- If a token is ever exposed in chat, screenshots, logs, or commits, rotate it immediately in Meta.

## 1) Required and optional env vars

Eazee required vars for **live send/dispatch**:

```env
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
```

Useful optional vars:

```env
WHATSAPP_CLOUD_API_VERSION=v19.0
CRON_SECRET=...
WHATSAPP_QUEUE_STATE_FILE=.data/whatsapp-queue-state.json
```

Without `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, Eazee send/dispatch falls back to **mock mode**.

## 2) Create Meta app and connect WhatsApp

1. Open Meta for Developers and create/select your app.
2. Add the WhatsApp use case.
3. In WhatsApp **API Setup**, connect or create your WhatsApp Business Account (WABA).
4. Save these IDs from API Setup:
   - **Phone Number ID** → used by Eazee.
   - **WhatsApp Business Account ID** → used in Meta-side management/subscriptions.

## 3) Get access token (temporary vs permanent)

- Temporary token: quick testing only, expires quickly.
- Permanent token (recommended):
  1. Meta Business Settings → **System users**.
  2. Create/select system user.
  3. Assign assets: your app + your WhatsApp Business Account.
  4. Grant required permissions.
  5. Generate token with scopes:
     - `business_management`
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`

## 4) Configure webhook for Eazee

Eazee endpoint:

- Callback URL: `https://<your-domain>/api/whatsapp/webhook`
- Verify Token: must equal `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Important token note:

- **Meta App Client token is NOT the webhook verify token**.
- The token shown in **App settings → Advanced → Client token** is different and should not be used as your webhook verification secret.
- Use your own secret string for `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and enter that same value in WhatsApp webhook configuration.

How verification works in this repo:

- Meta calls `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
- Eazee returns the challenge when token matches.

Where to configure this in Meta:

- App Dashboard → **Use cases** → **Connect with customers through WhatsApp** → **Customize** → **Configuration**.
- Configure callback + verify token there (not in the generic App Advanced callback URL field).

After verification:

1. Subscribe your app to webhook events.
2. In WhatsApp webhook fields, subscribe at least to:
   - `messages`
   - `message_status` (delivery lifecycle updates)

## 5) Create message templates (for outbound initiation)

When outside the 24-hour customer service window, use templates.

Template setup:

1. Open WhatsApp Manager → Message templates.
2. Click **Create template**.
3. Choose category (`Marketing`, `Utility`, or `Authentication`) and language.
4. Add template body and optional placeholders.
5. Submit for review and wait for approved status.

Quick test template send (example shape):

```json
{
  "messaging_product": "whatsapp",
  "to": "<RECIPIENT_PHONE>",
  "type": "template",
  "template": {
    "name": "hello_world",
    "language": { "code": "en_US" }
  }
}
```

Send endpoint format:

`POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages`

Dynamic template parameters example (body placeholders):

```json
{
  "messaging_product": "whatsapp",
  "to": "<RECIPIENT_PHONE>",
  "type": "template",
  "template": {
    "name": "promo_dynamic_v1",
    "language": { "code": "en_US" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Jossy" },
          { "type": "text", "text": "Ankara Bundle" },
          { "type": "text", "text": "12%" },
          { "type": "text", "text": "11:59 PM" }
        ]
      }
    ]
  }
}
```

Example template body to create in WhatsApp Manager:

`Hi {{1}}, {{2}} is now available with {{3}} off. Offer ends {{4}}.`

The order of `components[0].parameters` must match `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}`.

## 6) Configure Eazee local + production env

Set values in:

- `frontend/.env.local`
- Vercel Project Settings → Environment Variables

Restart app after local env updates.

## 7) Validate live mode in Eazee

After setting vars:

- `GET /api/whatsapp/send` should return `configured: true`.
- `POST /api/whatsapp/send` should return `mode: "live"` for valid recipient + body.
- `GET /api/whatsapp/webhook` verification should pass in Meta.
- `POST /api/whatsapp/dispatch-due` with `Authorization: Bearer <CRON_SECRET>` should dispatch due jobs.

## 8) Resolve “Currently Ineligible for Submission” fields

Meta app review typically needs:

- App icon (1024x1024)
- Privacy policy URL
- User data deletion instructions URL
- App category

For this repo:

- Privacy policy URL can be: `https://<your-domain>/privacy`
- User data deletion can point to the deletion section on the same page:
  `https://<your-domain>/privacy#user-data-deletion`

## 9) What else is needed to go fully live

- Approved templates for your campaign use-cases.
- Production phone number fully onboarded in WhatsApp Manager.
- Domain with HTTPS for webhook callback URL.
- Stable permanent token process and rotation procedure.
- Monitoring for webhook delivery failures and Graph API errors.

## 10) Deadline workaround before business verification is complete

You can still implement and demo the feature flow before business verification finishes:

1. Use your test phone number in WhatsApp API Setup.
2. Add recipient numbers as **test recipients** in Meta (where required).
3. Use approved starter template (`hello_world`) or a quick utility template.
4. Verify webhook against `GET /api/whatsapp/webhook` and subscribe to `messages` + `message_status`.
5. Validate in Eazee:

- `GET /api/whatsapp/send` returns `configured: true`
- `POST /api/whatsapp/send` returns `mode: "live"`
- `POST /api/whatsapp/dispatch-due` with `Authorization: Bearer <CRON_SECRET>` dispatches due jobs.

What you cannot bypass:

- Full production messaging scale and quality/rating growth requirements tied to account readiness.
- Policy/app review requirements for broad go-live.

## 11) Context7-backed references used

- Meta WhatsApp get started (app/WABA setup, permanent token flow)
- Meta Cloud API message endpoint shape for text/template sends
- Meta webhook payload/verification behavior for app subscription
