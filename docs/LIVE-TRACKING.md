# Live USPS and FedEx tracking on the hosted site

The hosted site (GitHub Pages) keeps your shipments in your browser and, out of the box, fills in statuses with a
built-in **mock** carrier. To get **real** statuses you need two things:

1. free developer credentials from USPS and FedEx, and
2. a tiny **relay** that calls the carriers for you. Browsers cannot call the USPS and FedEx APIs directly (the
   carriers block cross-origin requests), and you should never paste API secrets into a public website. The relay is a
   Cloudflare Worker (free plan is plenty) that holds your keys and forwards tracking numbers only. Its code is in
   [`worker/src/index.js`](../worker/src/index.js), about 200 lines you can read in full.

The whole setup takes about 20 minutes plus whatever time the carriers take to approve production access.

> Alternative: run the full app on your own computer (`docker compose up`, see the README). It has the same carrier
> settings built in and needs no relay. Use the relay when you want the hosted site with nothing installed.

## 1. USPS credentials

1. Go to <https://developers.usps.com/> and sign in with a USPS.com account (create one if needed).
2. Open **Apps** (top right, under your name) and click **Add App**.
3. Name it anything (for example `Fulfillment Tracker`). Leave the callback URL empty. Under **APIs** add the
   **Tracking** API (v3). Save.
4. Open the app and copy the **Consumer Key** and **Consumer Secret**. These are your `USPS_CLIENT_ID` and
   `USPS_CLIENT_SECRET`.
5. New apps start against the **test environment** (`apis-tem.usps.com`), which returns canned data. Production
   tracking needs a one-time approval: in the app, request **Production** access for Tracking. It usually takes a few
   business days. Until then set `USPS_SANDBOX` to `true` on the relay (step 3) to try things out.

## 2. FedEx credentials

1. Go to <https://developer.fedex.com/> and create a developer account (it can be tied to your FedEx shipping
   account, but does not have to be).
2. Open **My Projects** and click **Create a project**.
3. Choose the option for a company that ships with FedEx, then select the **Track API**. Name the project and accept
   the terms.
4. The project page shows a **Test key** (sandbox) immediately: an **API Key** and a **Secret Key**. The sandbox only
   returns data for FedEx's test tracking numbers.
5. For real shipments, open the **Production key** tab and request a production key for the Track API. FedEx grants
   this quickly for Track. Copy the production **API Key** and **Secret Key**: these are `FEDEX_API_KEY` and
   `FEDEX_SECRET_KEY`. (Sandbox keys work too with `FEDEX_SANDBOX=true`, but only for test numbers.)

## 3. Deploy the relay on Cloudflare

You need a free Cloudflare account: <https://dash.cloudflare.com/sign-up>. Pick one of the two routes.

### Route A: in the dashboard, no terminal

1. In the Cloudflare dashboard open **Workers & Pages** and click **Create**.
2. Choose **Start with Hello World!**, name the Worker `fulfillment-tracker-relay`, and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor and paste the full contents of
   [`worker/src/index.js`](../worker/src/index.js) (open the file on GitHub, click **Raw**, select all, copy). Click
   **Deploy**.
4. Go back to the Worker's page, open **Settings → Variables and Secrets**, and add these. Choose type **Secret** for
   the keys and the token:

   | Name | Type | Value |
   |---|---|---|
   | `RELAY_TOKEN` | Secret | A password you make up (a long random string is best). The site will ask for it. |
   | `USPS_CLIENT_ID` | Secret | USPS Consumer Key |
   | `USPS_CLIENT_SECRET` | Secret | USPS Consumer Secret |
   | `FEDEX_API_KEY` | Secret | FedEx API Key |
   | `FEDEX_SECRET_KEY` | Secret | FedEx Secret Key |
   | `USPS_SANDBOX` | Text | `true` while waiting for USPS production approval, otherwise `false` |
   | `FEDEX_SANDBOX` | Text | `false` for real shipments |
   | `ALLOWED_ORIGINS` | Text | `*`, or `https://<your-user>.github.io` to allow only your site |

   Click **Deploy** after saving the variables so they take effect.
5. Note the Worker's address, shown on its page: `https://fulfillment-tracker-relay.<your-subdomain>.workers.dev`.

You only need one carrier's keys to start; leave the other's blank and the site will say it is not configured.

### Route B: terminal with Wrangler

Needs Node.js 18 or newer.

```bash
git clone https://github.com/thomasdemuth/fufillment-tracker
cd fufillment-tracker/worker
npx wrangler login                     # opens the browser once
npx wrangler deploy                    # prints the Worker URL
npx wrangler secret put RELAY_TOKEN    # paste a password of your choosing
npx wrangler secret put USPS_CLIENT_ID
npx wrangler secret put USPS_CLIENT_SECRET
npx wrangler secret put FEDEX_API_KEY
npx wrangler secret put FEDEX_SECRET_KEY
```

Sandbox flags and allowed origins are plain variables in [`worker/wrangler.toml`](../worker/wrangler.toml); edit and
run `npx wrangler deploy` again.

## 4. Connect the site to the relay

1. Open the site with your data in the browser and go to **Settings → Carriers**.
2. Paste the Worker address into **Relay address** and your `RELAY_TOKEN` into **Relay token**.
3. Click **Test**. You should see "Relay reachable" and, for each carrier with keys, "Token OK from …". Click
   **Save**.
4. Go to the board and click **Refresh → Refresh all active shipments**. Statuses, events, expected delivery dates and
   the transit paths on the map now come from the carriers.

The relay address and token are stored only in this browser (like the rest of your data); the carrier keys never
leave Cloudflare.

## What leaves your browser

With a relay configured, each Refresh sends the **tracking numbers** of the shipments being refreshed to your Worker,
which sends them to USPS/FedEx. Names, addresses and everything else stay in the browser. The Privacy page lists the
relay host under "Outbound request log".

## Troubleshooting

| Message | Cause and fix |
|---|---|
| "Could not reach the relay" | Wrong address, or the Worker is not deployed. Open the address in a new tab: you should get a JSON error about a missing token, which means the Worker is alive. |
| "The relay rejected the token" | The token typed on the site differs from the `RELAY_TOKEN` secret. Re-enter one of them. |
| "The RELAY_TOKEN secret is not set" | Add the secret in the Worker's Variables and Secrets and click Deploy. |
| "USPS credentials are not set on the relay" | Add `USPS_CLIENT_ID` and `USPS_CLIENT_SECRET` (same for FedEx). |
| "USPS rejected the credentials (400/401)" | Key or secret mistyped, or the app has no Tracking API attached. |
| "USPS authorization failed (403)" | Tracking is not enabled for production on this app yet; request production access, or set `USPS_SANDBOX=true` meanwhile. |
| "FedEx error 4xx" for real numbers | You are using a sandbox key. Request a production key, or set `FEDEX_SANDBOX=true` only for FedEx test numbers. |
| Browser console shows a CORS error | `ALLOWED_ORIGINS` on the Worker does not include your site's origin. Set it to `*` or to `https://<your-user>.github.io`. |
| Statuses stop updating after a while | Carrier rate limits (USPS test keys are tight). Refresh less often, or fewer shipments at a time via the filters. |

Cloudflare's free plan allows 100,000 Worker requests per day; a refresh of 300 shipments uses about 10 relay calls.
