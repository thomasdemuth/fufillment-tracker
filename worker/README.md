# Tracking relay (Cloudflare Worker)

Lets the hosted UI (GitHub Pages, data kept in your browser) fetch **live USPS and FedEx status** with your own
carrier credentials. The Worker holds the keys; the browser sends tracking numbers and gets carrier responses back.
Cloudflare's free plan is more than enough.

Full walkthrough with screenshots-in-words, including the no-terminal route: [`docs/LIVE-TRACKING.md`](../docs/LIVE-TRACKING.md).

No terminal? Add the keys as repository secrets and run the **deploy-relay** GitHub Action (route C in the guide).

Quick version (terminal):

```bash
cd worker
npx wrangler login
npx wrangler deploy                          # prints https://fulfillment-tracker-relay.<you>.workers.dev
npx wrangler secret put RELAY_TOKEN          # any password you choose; the site asks for it
npx wrangler secret put USPS_CLIENT_ID
npx wrangler secret put USPS_CLIENT_SECRET
npx wrangler secret put FEDEX_API_KEY
npx wrangler secret put FEDEX_SECRET_KEY
```

Then on the site: **Settings → Carriers → Live tracking relay**, paste the Worker URL and the token, **Test**, **Save**.
