/**
 * CricClubs integration.
 *
 * Real endpoint (per client-provided example):
 *   GET https://core-prod-origin.cricclubs.com/core/player/getPlayerBattingStats
 *       ?v=4.0.536&X-Auth-Token=&playerId={id}
 *   Headers: x-consumer-key, x-api-key
 *
 * IMPORTANT: the credentials shared during design were posted in plaintext
 * in chat and MUST be rotated with CricClubs before this goes live. Store
 * the new ones as CRICCLUBS_CONSUMER_KEY / CRICCLUBS_API_KEY server-side
 * env vars — never in client code or committed files.
 *
 * This module is mocked for the MVP build (no live credentials yet) but
 * matches the real response shape so swapping in the live fetch later is a
 * one-function change — nothing else in the app needs to know the difference.
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

export async function fetchCricClubsStats(cricclubsId: string): Promise<CricClubsProfile> {
  if (USE_MOCK) {
    return mockResponse(cricclubsId);
  }

  const res = await fetch(
    `https://core-prod-origin.cricclubs.com/core/player/getPlayerBattingStats?v=4.0.536&playerId=${encodeURIComponent(
      cricclubsId
    )}`,
    {
      headers: {
        "x-consumer-key": process.env.CRICCLUBS_CONSUMER_KEY!,
        "x-api-key": process.env.CRICCLUBS_API_KEY!,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`CricClubs API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // NOTE: exact field mapping should be confirmed against a real payload —
  // this is a reasonable best-guess shape based on the sample endpoint.
  return {
    matchesPlayed: data.matchesPlayed ?? 0,
    battingAvg: data.battingAverage ?? 0,
    battingSr: data.strikeRate ?? 0,
    bowlingAvg: data.bowlingAverage ?? 0,
    bowlingEcon: data.economy ?? 0,
    profile: {
      name: data.playerName ?? "",
      club: data.clubName ?? "",
      photoUrl: data.photoUrl ?? null,
    },
    raw: data,
  };
}

function mockResponse(cricclubsId: string): CricClubsProfile {
  // Deterministic pseudo-random stats seeded by the ID, so repeated syncs
  // in dev/demo look stable rather than jumping around randomly.
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
