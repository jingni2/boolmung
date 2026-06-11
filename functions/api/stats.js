const MAX_SESSION_SECONDS = 12 * 60 * 60;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  },
});

const getStats = async (db) => {
  const [visitorRow, statsRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM site_visitors").first(),
    db.prepare("SELECT total_seconds FROM site_stats WHERE id = 1").first(),
  ]);

  return {
    visitors: Number(visitorRow?.count || 0),
    totalSeconds: Number(statsRow?.total_seconds || 0),
  };
};

export const onRequestGet = async ({ env }) => {
  if (!env.STATS_DB) {
    return json({ error: "STATS_DB binding is missing" }, 503);
  }
  return json(await getStats(env.STATS_DB));
};

export const onRequestOptions = async () => new Response(null, {
  status: 204,
  headers: CORS_HEADERS,
});

export const onRequestPost = async ({ request, env }) => {
  if (!env.STATS_DB) {
    return json({ error: "STATS_DB binding is missing" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 80) : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 80) : "";
  const activeSeconds = Math.floor(Number(body.activeSeconds));
  if (!visitorId || !sessionId || !Number.isFinite(activeSeconds) || activeSeconds < 0) {
    return json({ error: "Invalid stats payload" }, 400);
  }

  const now = Date.now();
  const safeActiveSeconds = Math.min(activeSeconds, MAX_SESSION_SECONDS);
  const previousSession = await env.STATS_DB
    .prepare("SELECT active_seconds FROM visitor_sessions WHERE session_id = ?")
    .bind(sessionId)
    .first();
  const previousSeconds = Number(previousSession?.active_seconds || 0);
  const creditedSeconds = Math.max(0, safeActiveSeconds - previousSeconds);

  await env.STATS_DB.batch([
    env.STATS_DB
      .prepare("INSERT OR IGNORE INTO site_visitors (visitor_id, first_seen) VALUES (?, ?)")
      .bind(visitorId, now),
    env.STATS_DB
      .prepare(`
        INSERT INTO visitor_sessions (session_id, visitor_id, active_seconds, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          active_seconds = MAX(visitor_sessions.active_seconds, excluded.active_seconds),
          updated_at = excluded.updated_at
      `)
      .bind(sessionId, visitorId, safeActiveSeconds, now),
    env.STATS_DB
      .prepare(`
        INSERT INTO site_stats (id, total_seconds, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          total_seconds = site_stats.total_seconds + excluded.total_seconds,
          updated_at = excluded.updated_at
      `)
      .bind(creditedSeconds, now),
  ]);

  return json(await getStats(env.STATS_DB));
};
