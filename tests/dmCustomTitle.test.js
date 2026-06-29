import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Real botStrings on purpose — we are testing the tNotif env override.
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "/tmp/questorr-dm-title-test.json" }));
vi.mock("../utils/notifyDedup.js", () => ({ markNotified: vi.fn() }));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldPost: vi.fn(() => ({ post: true })), markPosted: vi.fn() }));
vi.mock("../bot/botState.js", () => ({ pendingRequests: new Map(), savePendingRequests: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../api/tmdb.js", () => ({ findBestBackdrop: vi.fn(), getTmdbLanguage: vi.fn(() => "en") }));

const { sendRequesterDm } = await import("../seerrWebhook.js");

const DISCORD_ID = "123456789012345678";
const data = {
  subject: "Dune",
  media: { media_type: "movie", tmdbId: 1 },
  request: { requestedBy_settings_discordId: DISCORD_ID, requestedBy_username: "bob" },
};

function makeClient() {
  let captured = null;
  const send = vi.fn(async (opts) => { captured = opts; });
  const client = { users: { fetch: vi.fn(async () => ({ send })) } };
  return { client, get: () => captured };
}

beforeEach(() => {
  process.env.BOT_LANGUAGE = "de";
  delete process.env.NOTIF_TITLE_MEDIA_PENDING;
});
afterEach(() => {
  delete process.env.BOT_LANGUAGE;
  delete process.env.NOTIF_TITLE_MEDIA_PENDING;
});

describe("DM author honours the configured notification title", () => {
  it("uses the custom NOTIF_TITLE for the DM author when set", async () => {
    process.env.NOTIF_TITLE_MEDIA_PENDING = "Deine Anfrage wurde gesendet 🕵🏼";
    const { client, get } = makeClient();

    await sendRequesterDm(data, "MEDIA_PENDING", {}, client, { data: {} }, null, {});

    expect(get().embeds[0].data.author.name).toBe("Deine Anfrage wurde gesendet 🕵🏼");
  });

  it("falls back to the default DM author text when no custom title is set", async () => {
    const { client, get } = makeClient();

    await sendRequesterDm(data, "MEDIA_PENDING", {}, client, { data: {} }, null, {});

    // de default for dm_pending_author
    expect(get().embeds[0].data.author.name).toBe("⏳ Anfrage eingereicht");
  });
});
