import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal mocks so seerrWebhook.js imports cleanly in the test env.
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../utils/configFile.js", () => ({ CONFIG_PATH: "/tmp/questorr-test-config.json" }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k, tNotif: (k) => k }));
vi.mock("../utils/notifyDedup.js", () => ({ markNotified: vi.fn() }));
vi.mock("../utils/notificationDispatcher.js", () => ({ shouldPost: vi.fn(() => ({ post: true })), markPosted: vi.fn() }));
vi.mock("../bot/botState.js", () => ({ pendingRequests: new Map(), savePendingRequests: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../api/tmdb.js", () => ({ findBestBackdrop: vi.fn(), getTmdbLanguage: vi.fn(() => "en") }));

const { sendRequesterDm } = await import("../seerrWebhook.js");

function makeClient(send) {
  return { users: { fetch: vi.fn(async () => ({ send })) } };
}

// Payload whose Discord ID resolves directly from the webhook (no mapping needed).
// Must be a real Discord snowflake — the resolver rejects non-snowflake values
// (e.g. unrendered "{{requestedBy_settings_discordId}}" placeholders).
const DISCORD_ID = "123456789012345678";
const data = {
  subject: "Dune",
  media: { media_type: "movie", tmdbId: 1 },
  request: { requestedBy_settings_discordId: DISCORD_ID, requestedBy_username: "bob" },
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NOTIFY_ON_AVAILABLE;
});

describe("MEDIA_AVAILABLE DM gate (NOTIFY_ON_AVAILABLE)", () => {
  it("suppresses the availability DM when NOTIFY_ON_AVAILABLE is 'false'", async () => {
    process.env.NOTIFY_ON_AVAILABLE = "false";
    const send = vi.fn();
    const client = makeClient(send);

    await sendRequesterDm(data, "MEDIA_AVAILABLE", {}, client, { data: {} }, null, {});

    expect(client.users.fetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does NOT gate other events (e.g. MEDIA_DECLINED) on NOTIFY_ON_AVAILABLE", async () => {
    process.env.NOTIFY_ON_AVAILABLE = "false";
    const send = vi.fn();
    const client = makeClient(send);

    await sendRequesterDm(data, "MEDIA_DECLINED", {}, client, { data: {} }, null, {});

    // Declined must still resolve the user and attempt the DM.
    expect(client.users.fetch).toHaveBeenCalledWith(DISCORD_ID);
  });

  it("sends the availability DM when NOTIFY_ON_AVAILABLE is unset (default on)", async () => {
    const send = vi.fn();
    const client = makeClient(send);

    await sendRequesterDm(data, "MEDIA_AVAILABLE", {}, client, { data: {} }, null, {});

    expect(client.users.fetch).toHaveBeenCalledWith(DISCORD_ID);
  });
});
