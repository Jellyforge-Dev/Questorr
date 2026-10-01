import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal mocks so seerrWebhook.js imports cleanly in the test env.
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "/tmp/questorr-localized-text-test.json" }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k, tNotif: (k) => k }));
vi.mock("../utils/notifyDedup.js", () => ({ markNotified: vi.fn() }));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldPost: vi.fn(() => ({ post: true })), markPosted: vi.fn() }));
vi.mock("../bot/botState.js", () => ({ pendingRequests: new Map(), savePendingRequests: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../api/tmdb.js", () => ({ findBestBackdrop: vi.fn(), getTmdbLanguage: vi.fn(() => "en") }));

const { localizedTitle, sendRequesterDm } = await import("../../seerrWebhook.js");

describe("localizedTitle", () => {
  it("appends the release year for a movie", () => {
    const details = { title: "Dune : Deuxième Partie", release_date: "2024-02-27" };
    expect(localizedTitle(details, "movie")).toBe("Dune : Deuxième Partie (2024)");
  });

  it("appends the first-air year for a tv show", () => {
    const details = { name: "Kiff", first_air_date: "2023-05-13" };
    expect(localizedTitle(details, "tv")).toBe("Kiff (2023)");
  });

  it("omits the year suffix when no date is present", () => {
    const details = { title: "Untitled" };
    expect(localizedTitle(details, "movie")).toBe("Untitled");
  });

  it("returns null when TMDB details are missing (caller falls back to Seerr's subject)", () => {
    expect(localizedTitle(null, "movie")).toBeNull();
    expect(localizedTitle({}, "movie")).toBeNull();
  });
});

describe("sendRequesterDm title source", () => {
  const DISCORD_ID = "123456789012345678";
  const data = {
    subject: "Dune (Seerrs eigene Sprache)",
    media: { media_type: "movie", tmdbId: 1 },
    request: { requestedBy_settings_discordId: DISCORD_ID, requestedBy_username: "bob" },
  };

  function makeClient() {
    let captured = null;
    const send = vi.fn(async (opts) => { captured = opts; });
    const client = { users: { fetch: vi.fn(async () => ({ send })) } };
    return { client, get: () => captured };
  }

  beforeEach(() => vi.clearAllMocks());

  it("prefers the already-localized channel-embed title over Seerr's raw subject", async () => {
    const { client, get } = makeClient();
    const channelEmbed = { data: { title: "Dune (BOT_LANGUAGE-Titel)" } };

    await sendRequesterDm(data, "MEDIA_PENDING", {}, client, channelEmbed, null, {});

    expect(get().embeds[0].data.title).toBe("Dune (BOT_LANGUAGE-Titel)");
  });

  it("falls back to Seerr's subject when the channel embed has no title (e.g. TMDB unavailable)", async () => {
    const { client, get } = makeClient();

    await sendRequesterDm(data, "MEDIA_PENDING", {}, client, { data: {} }, null, {});

    expect(get().embeds[0].data.title).toBe("Dune (Seerrs eigene Sprache)");
  });
});
