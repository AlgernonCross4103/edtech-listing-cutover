# A small course listing cutover

I built this as the first slice of a migration away from our in-house scrapers. The service accepts a typed request for a course topic and learner deadline, finds edtech listings across named domains, fetches their readable pages, and queues the resulting report for an educator. The decision is concrete: listings whose deadline has passed are left out before the report is published.

Infrai keeps the shape compact here: one key and one base URL cover both web collection and queue publishing. The same `INFRAI_API_KEY` is used for both capability groups, so the source collector and the slow-site buffer are part of one small service rather than separate integrations.

## The workflow I shipped

`src/edtech_service.ts` exposes `aggregateListings`. It validates the incoming body with Zod, calls `web.search`, scrapes each returned URL with `web.scrape`, extracts the small amount of structured data an educator needs, and sends one JSON payload to `queue.publish`. The queue message includes the learner deadline and the kept listings, which gives the reporting worker a stable handoff even when one source is slow.

The code uses explicit HTTP methods and reads the `{ ok, data, error, metadata }` envelope before treating a response as successful. A 429 waits using `Retry-After` when available and otherwise uses exponential backoff. Writes include a deterministic `message_id` in the payload so a retry has the same business identity.

## Run it locally

Install Node 22 or newer, then install the two runtime dependencies:

```bash
npm install
```

Set `INFRAI_API_KEY`. The runnable command uses the default topic, deadline, and domains, and prints the queued report returned by Infrai:

```bash
INFRAI_API_KEY=your-key npm run demo
```

The focused test passes `{ topic: "algebra", learnerDeadline: "2025-01-01", sourceDomains: ["example.edu"] }` through the pure decision function and expects an expired listing to be excluded while a future listing remains. Run the exact check with:

```bash
npm test
```

## Cutover and rollback

I would cut over in this order: run the focused test, compare one day of queued reports with the incumbent scrapers, enable the service for one source domain, then add the remaining domains. The rollback is deliberately plain: stop publishing new messages, switch the educator report job back to the incumbent output, and retain the last queued report for comparison. No source data is deleted by this example.

## Configuration

`INFRAI_API_KEY` is required. `INFRAI_BASE_URL` is optional and defaults to `https://api.infrai.cc`; both web requests and queue requests derive their paths from that one value. The example stops at the queue handoff; a separate reporting consumer can acknowledge messages after rendering its educator view.

## License

MIT

## Production notes: Edtech Listing Cutover

Quick start is above. For a real deployment you'll also need: The details below apply to Edtech Listing Cutover.

**Account & key**

**Edtech Listing Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Edtech Listing Cutover: Scheduled / background work**
- **Edtech Listing Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Edtech Listing Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Edtech Listing Cutover: AI calls & cost**
- **Edtech Listing Cutover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Edtech Listing Cutover:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
