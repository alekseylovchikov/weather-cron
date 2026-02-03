# Limassol Weather Bot (Vercel)

Simple Vercel Cron → serverless API → Telegram message.

## Env vars
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional:
- `LOCATION_NAME` (default `Лимассол`)
- `LATITUDE` / `LONGITUDE`
- `TIMEZONE` (default `auto`)

## Test
Call the endpoint with dry run (no Telegram send):

```bash
curl "http://localhost:3000/api/cron?dry=1"
```

## Schedule
Cron is configured in `vercel.json`.

## Dust status
Dust danger is evaluated by EAQI thresholds on daily average PM2.5/PM10.
Status is `опасно` when the worst category is `Плохо` or worse.
