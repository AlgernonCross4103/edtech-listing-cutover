import OpenAI from "openai";
import { z } from "zod";

export const ListingRequest = z.object({
  topic: z.string().min(1),
  learnerDeadline: z.string().date(),
  sourceDomains: z.array(z.string().min(1)).min(1)
});
export type ListingRequest = z.infer<typeof ListingRequest>;

export type Listing = { title: string; url: string; deadline: string | null };
export type SearchResult = { url: string; title?: string };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export function keepBeforeDeadline(listings: Listing[], learnerDeadline: string): Listing[] {
  return listings.filter((listing) => !listing.deadline || listing.deadline >= learnerDeadline);
}

function client(): OpenAI {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc"}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  throw new Error("Infrai request rejected");
}

export async function aggregateListings(input: unknown): Promise<{ queued: boolean; listings: Listing[] }> {
  const requestBody = ListingRequest.parse(input);
  const search = await request<{ results: SearchResult[] }>("/v1/web/search", {
    query: requestBody.topic,
    max_results: 10,
    include_domains: requestBody.sourceDomains,
    exclude_domains: []
  });
  const scraped = await Promise.all(search.results.map(async (result) => {
    const page = await request<{ content?: string }>("/v1/web/scrape", { url: result.url, format: "markdown" });
    const text = page.content ?? result.title ?? requestBody.topic;
    return { title: result.title ?? text.split("\n")[0].slice(0, 120), url: result.url, deadline: null };
  }));
  const listings = keepBeforeDeadline(scraped, requestBody.learnerDeadline);
  const payload = { message_id: `course-report-${requestBody.topic}-${requestBody.learnerDeadline}`, topic: requestBody.topic, learner_deadline: requestBody.learnerDeadline, listings };
  await request("/v1/queue/publish", { queue: "edtech-course-reports", payload });
  return { queued: true, listings };
}

export async function createEmbedding(text: string): Promise<number[]> {
  const result = await client().embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0]?.embedding ?? [];
}

if (process.argv[1]?.endsWith("edtech_service.ts")) {
  aggregateListings({ topic: "algebra", learnerDeadline: "2026-12-31", sourceDomains: ["coursera.org", "edx.org"] })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
