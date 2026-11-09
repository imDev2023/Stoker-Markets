// A stand-in for twitterapi.io (#160), the X data API the mentions job searches: `GET /twitter/tweet/advanced_search`
// with twitterapi.io's own shapes (up to twenty posts a page, newest first, `X-API-Key`, 401 without it, 429 when told
// to), answering from the posts a test puts here, and the authors' pictures at `/pictures/<handle>.png`. Nothing here
// ever reaches X or twitterapi.io: a test, a job or a page on the test stack only ever talks to this.
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

export const X_API_KEY = "test-twitterapi-key";

export type StandInPost = {
  id: string;
  text: string;
  /** When it was posted; now unless set. */
  createdAt?: string;
  /** Links the post carries, matched by a `url:"..."` term as X matches a post's expanded links. */
  urls?: string[];
  author: { id: string; userName: string; name: string; profilePicture?: string | null };
};

export type XStandIn = {
  url: string;
  apiKey: string;
  stop: () => Promise<void>;
};

/** One search term: a phrase in quotes, a link (`url:"..."`) or a cashtag. */
type Term = { kind: "phrase" | "url" | "cashtag"; value: string };

/** Parses the queries the mentions job sends: `(term OR term ...) since_time:N`. */
function parse(query: string) {
  const since = Number(/since_time:(\d+)/.exec(query)?.[1] ?? 0);
  const terms: Term[] = [];
  for (const m of query.matchAll(/url:"([^"]+)"|"([^"]+)"|\$([A-Za-z][A-Za-z0-9]*)/g)) {
    if (m[1]) terms.push({ kind: "url", value: m[1] });
    else if (m[2]) terms.push({ kind: "phrase", value: m[2] });
    else if (m[3]) terms.push({ kind: "cashtag", value: m[3] });
  }
  return { since, terms };
}

function matches(post: StandInPost, terms: Term[]) {
  return terms.some((t) =>
    t.kind === "phrase" ? post.text.includes(t.value)
    : t.kind === "url" ? [...(post.urls ?? []), post.text].some((u) => u.includes(t.value))
    : new RegExp(`\\$${t.value}\\b`, "i").test(post.text),
  );
}

/** X's own date format, which twitterapi.io passes through: `Tue Dec 10 07:00:30 +0000 2024`. */
function xDate(d: Date) {
  // toUTCString is `Tue, 10 Dec 2024 07:00:30 GMT`.
  const [weekday, date, month, year, time] = d.toUTCString().replace(",", "").split(" ");
  return `${weekday} ${month} ${date} ${time} +0000 ${year}`;
}

/** A square PNG of one colour, so each author's picture is a real image of its own. */
function png(rgb: [number, number, number], size = 16) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
}

/** A colour from a handle, so two authors' pictures differ. */
function colourOf(name: string): [number, number, number] {
  let h = 0;
  for (const ch of name) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return [64 + (h & 0x7f), 64 + ((h >> 7) & 0x7f), 64 + ((h >> 14) & 0x7f)];
}

/**
 * Test controls beside twitterapi.io's endpoint: `POST /stand-in/posts` adds posts, `POST /stand-in/rate-limit` makes
 * the next `count` searches answer 429, and `GET /stand-in/requests` lists every search received, with its query.
 */
export async function startXStandIn(port: number): Promise<XStandIn> {
  const url = `http://127.0.0.1:${port}`;
  const posts: StandInPost[] = [];
  const requests: { query: string; status: number }[] = [];
  let limited = 0;

  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", url);
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
    const read = () =>
      new Promise<unknown>((resolve) => {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", () => resolve(body ? JSON.parse(body) : null));
      });

    const picture = /^\/pictures\/([A-Za-z0-9_]+)\.png$/.exec(u.pathname);
    if (req.method === "GET" && picture) return res.writeHead(200, { "content-type": "image/png" }).end(png(colourOf(picture[1]!)));

    if (u.pathname === "/stand-in/posts" && req.method === "POST")
      return void read().then((b) => {
        for (const p of (b as { posts: StandInPost[] }).posts) {
          const author = { ...p.author, profilePicture: p.author.profilePicture === undefined ? `${url}/pictures/${p.author.userName}.png` : p.author.profilePicture };
          posts.push({ ...p, createdAt: p.createdAt ?? new Date().toISOString(), author });
        }
        json(200, { posts: posts.length });
      });
    if (u.pathname === "/stand-in/rate-limit" && req.method === "POST")
      return void read().then((b) => {
        limited = (b as { count: number }).count;
        json(200, { limited });
      });
    if (u.pathname === "/stand-in/requests" && req.method === "GET") return json(200, { requests });

    if (u.pathname === "/twitter/tweet/advanced_search" && req.method === "GET") {
      const query = u.searchParams.get("query") ?? "";
      if (req.headers["x-api-key"] !== X_API_KEY) {
        requests.push({ query, status: 401 });
        return json(401, { error: 401, message: "Unauthorized" });
      }
      if (limited > 0) {
        limited--;
        requests.push({ query, status: 429 });
        return json(429, { error: 429, message: "Too many requests" }, { "retry-after": "1" });
      }
      requests.push({ query, status: 200 });
      const { since, terms } = parse(query);
      const found = posts
        .filter((p) => Date.parse(p.createdAt!) / 1000 >= since && matches(p, terms))
        .sort((a, b) => Date.parse(b.createdAt!) - Date.parse(a.createdAt!))
        .slice(0, 20)
        .map((p) => ({
          type: "tweet",
          id: p.id,
          url: `https://x.com/${p.author.userName}/status/${p.id}`,
          text: p.text,
          createdAt: xDate(new Date(p.createdAt!)),
          author: { type: "user", id: p.author.id, userName: p.author.userName, name: p.author.name, profilePicture: p.author.profilePicture },
        }));
      return json(200, { tweets: found, has_next_page: false, next_cursor: "" });
    }
    json(404, { error: 404, message: "not found" });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url, apiKey: X_API_KEY, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
