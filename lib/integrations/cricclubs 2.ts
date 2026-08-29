/**
 * CricClubs integration.
 *
 * Three confirmed endpoints (client-provided, clubId added per CricClubs'
 * own "APIs for League Management" doc which confirms it's required on
 * every endpoint — NOTE: the client's example URLs for these three did NOT
 * include clubId, so if real calls fail, that's the first thing to check):
 *
 *   GET .../core/player/getPlayerBattingStats?v=4.0.536&X-Auth-Token=&clubId={clubId}&playerId={id}
 *   GET .../core/player/getPlayerBowlingStats?v=4.0.536&X-Auth-Token=&clubId={clubId}&playerId={id}
 *   GET .../core/player/getStats?v=4.0.536&X-Auth-Token=&clubId={clubId}&playerId={id}
 *   Headers: x-consumer-key, x-api-key
 *
 * clubId is set via CRICCLUBS_CLUB_ID env var (confirmed 4010 for this org).
 *
 * IMPORTANT: rotate credentials before going live — never commit real
 * CRICCLUBS_CONSUMER_KEY / CRICCLUBS_API_KEY values, only set as env vars.
 *
 * Field-name caveat: still untested against real responses (no network
 * path to CricClubs from the dev sandbox that built this). All three
 * endpoints are fetched and merged (overall > batting > bowling
 * precedence) before field lookup, so whichever endpoint actually has a
 * given field gets picked up. If real field names differ from all the
 * variants tried in parseStatsResponse, parsed numbers come back as 0
 * rather than erroring — always cross-check raw_payload (stored in full,
 * per-endpoint) in Supabase after a real sync and fix the lookups below if
 * needed. A partial failure (e.g. a player with no bowling record causing
 * getPlayerBowlingStats to error) does not block the other two endpoints —
 * each is fetched independently.
 */

export interface CricClubsProfile {
  matchesPlayed: number;
  battingAvg: number;
  battingSr: number;
  bowlingAvg: number;
  bowlingEcon: number;
  profile: {
    name: string;
    club: string;
    photoUrl: string | null;
  };
  raw: unknown;
}

const USE_MOCK = !process.env.CRICCLUBS_API_KEY;
const CLUB_ID = process.env.CRICCLUBS_CLUB_ID;

function buildUrl(endpoint: string, cricclubsId: string): string {
  return `https://core-prod-origin.cricclubs.com/core/player/${endpoint}?v=4.0.536&X-Auth-Token=&clubId=${encodeURIComponent(
    CLUB_ID ?? ""
  )}&playerId=${encodeURIComponent(cricclubsId)}`;
}

async function fetchEndpoint(endpoint: string, cricclubsId: string): Promise<unknown | null> {
  try {
    const res = await fetch(buildUrl(endpoint, cricclubsId), {
      headers: {
        "x-consumer-key": process.env.CRICCLUBS_CONSUMER_KEY!,
        "x-api-key": process.env.CRICCLUBS_API_KEY!,
        // Node's server-side fetch does NOT send an Accept header the way
        // a browser does — some API gateways (including, seemingly,
        // CricClubs') reject requests without one, returning 406. Also
        // sending a browser-like User-Agent in case the gateway filters
        // on that too.
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        // ignore — body may not be readable
      }
      console.error(
        `CricClubs ${endpoint} error for player ${cricclubsId}: ${res.status} ${res.statusText}${
          bodyText ? ` — body: ${bodyText.slice(0, 500)}` : ""
        }`
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`CricClubs ${endpoint} fetch failed for player ${cricclubsId}:`, err);
    return null;
  }
}

export async function fetchCricClubsStats(cricclubsId: string): Promise<CricClubsProfile> {
  if (USE_MOCK) {
    return mockResponse(cricclubsId);
  }

  if (!CLUB_ID) {
    throw new Error("CRICCLUBS_CLUB_ID env var is not set — required on every CricClubs API call.");
  }

  // Fetch independently — a player with no bowling record (pure batsman)
  // might have getPlayerBowlingStats fail/return empty, which shouldn't
  // block batting or overall stats from being captured.
  const [overall, batting, bowling] = await Promise.all([
    fetchEndpoint("getStats", cricclubsId),
    fetchEndpoint("getPlayerBattingStats", cricclubsId),
    fetchEndpoint("getPlayerBowlingStats", cricclubsId),
  ]);

  if (!overall && !batting && !bowling) {
    throw new Error(`All three CricClubs endpoints failed for player ${cricclubsId}`);
  }

  return parseStatsResponse({ overall, batting, bowling });
}

/**
 * Tries multiple plausible field-name variants per stat, in order, and
 * uses the first one that's actually present. See module doc comment for
 * why exact field names couldn't be confirmed ahead of time.
 */
function pick(sources: any[], keys: string[], fallback: number = 0): number {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const val = source[key];
      if (val !== undefined && val !== null && val !== "") {
        const num = Number(val);
        if (!isNaN(num)) return num;
      }
    }
  }
  return fallback;
}

function pickStr(sources: any[], keys: string[], fallback: string = ""): string {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const val = source[key];
      if (val !== undefined && val !== null && val !== "") return String(val);
    }
  }
  return fallback;
}

export function parseStatsResponse(raw: { overall: any; batting: any; bowling: any }): CricClubsProfile {
  // Some APIs wrap the actual payload in a nested "data"/"result" key —
  // unwrap each source if so, and also check one level of nesting for
  // sub-objects like "battingStats"/"bowlingStats" in case getStats
  // returns them nested rather than flat.
  const unwrap = (obj: any) => obj?.data ?? obj?.result ?? obj;
  const overall = unwrap(raw.overall);
  const batting = unwrap(raw.batting);
  const bowling = unwrap(raw.bowling);

  // Precedence: overall (getStats) first since it's the intended combined
  // view, then the dedicated batting/bowling endpoints as fallback for
  // anything overall doesn't have. Also check likely nested sub-keys.
  const sources = [
    overall,
    overall?.battingStats,
    overall?.bowlingStats,
    batting,
    bowling,
  ];

  return {
    matchesPlayed: pick(sources, ["matchesPlayed", "matches_played", "matches", "totalMatches", "noOfMatches"]),
    battingAvg: pick(sources, ["battingAverage", "batting_average", "battingAvg", "avg", "average"]),
    battingSr: pick(sources, ["strikeRate", "strike_rate", "battingStrikeRate", "sr"]),
    bowlingAvg: pick(sources, ["bowlingAverage", "bowling_average", "bowlingAvg"]),
    bowlingEcon: pick(sources, ["economy", "economyRate", "economy_rate", "eco"]),
    profile: {
      name: pickStr(sources, ["playerName", "player_name", "name", "fullName"]),
      club: pickStr(sources, ["clubName", "club_name", "club", "teamName"]),
      photoUrl: pickStr(sources, ["photoUrl", "photo_url", "imageUrl", "profileImage"]) || null,
    },
    raw, // full raw payload from all three endpoints, kept for diagnosis
  };
}

function mockResponse(cricclubsId: string): CricClubsProfile {
  const seed = [...cricclubsId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (min: number, max: number) => min + ((seed * 37) % (max - min));

  return {
    matchesPlayed: rand(5, 60),
    battingAvg: rand(15, 55),
    battingSr: rand(90, 160),
    bowlingAvg: rand(18, 40),
    bowlingEcon: rand(5, 9),
    profile: {
      name: `Mock Player ${cricclubsId}`,
      club: "Coastal Cricket Club",
      photoUrl: null,
    },
    raw: { mock: true, cricclubsId },
  };
}

/**
 * Fetches the roster of players for a given CricClubs team. NOT YET WIRED
 * INTO ANY UI — scaffolding for a future "import players directly from
 * CricClubs" feature. Field-name caveats from the module doc comment
 * apply here too (untested against a real response).
 */
export async function fetchCricClubsTeamPlayers(teamId: string): Promise<{ raw: unknown; players: unknown[] }> {
  if (!CLUB_ID) {
    throw new Error("CRICCLUBS_CLUB_ID env var is not set.");
  }
  if (!process.env.CRICCLUBS_API_KEY) {
    throw new Error("CricClubs credentials not configured — this function requires live credentials, no mock mode.");
  }

  const res = await fetch(
    `https://core-prod-origin.cricclubs.com/core/team/getTeamPlayers?clubId=${encodeURIComponent(
      CLUB_ID
    )}&teamId=${encodeURIComponent(teamId)}`,
    {
      headers: {
        "x-consumer-key": process.env.CRICCLUBS_CONSUMER_KEY!,
        "x-api-key": process.env.CRICCLUBS_API_KEY!,
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`CricClubs API error: ${res.status} ${res.statusText} for team ${teamId}`);
  }

  const data = await res.json();
  const players = Array.isArray(data) ? data : data?.players ?? data?.data ?? [];
  return { raw: data, players };
}
