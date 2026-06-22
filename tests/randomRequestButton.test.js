import { describe, it, expect, vi, beforeEach } from "vitest";

const add = vi.fn();
const sendRequest = vi.fn();
const tmdbGetDetails = vi.fn();

vi.mock("../utils/requestStore.js", () => ({ add }));
vi.mock("../api/seerr.js", () => ({ sendRequest }));
vi.mock("../api/tmdb.js", () => ({ tmdbGetDetails }));
vi.mock("../bot/botUtils.js", () => ({
  parseQualityAndServerOptions: vi.fn(() => ({ profileId: null, serverId: null })),
  getSeerrAutoApprove: vi.fn(() => false),
}));
vi.mock("../bot/botState.js", () => ({
  pendingRequests: new Map(),
  savePendingRequests: vi.fn(),
}));
vi.mock("../utils/configFile.js", () => ({ getUserMappings: vi.fn(() => []) }));
vi.mock("../bot/helpers.js", () => ({
  getSeerrUrl: vi.fn(() => "http://seerr"),
  getSeerrApiKey: vi.fn(() => "key"),
  getTmdbApiKey: vi.fn(() => "tmdb"),
}));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleRandomRequestButton } = await import("../bot/handlers/randomRequestButton.js");

function makeInteraction(customId) {
  return {
    customId,
    user: { id: "discord-user-2" },
    deferUpdate: vi.fn(),
    reply: vi.fn(),
    followUp: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleRandomRequestButton → requestStore.add", () => {
  it("records the created Seerr requestId after a daily-random request", async () => {
    tmdbGetDetails.mockResolvedValue({ title: "Fallout" });
    sendRequest.mockResolvedValue({ id: 7777 });

    await handleRandomRequestButton(makeInteraction("random_request_84958_movie"));

    expect(add).toHaveBeenCalledWith({
      requestId: 7777,
      tmdbId: 84958,
      mediaType: "movie",
      title: "Fallout",
      discordUserId: "discord-user-2",
    });
  });

  it("falls back to requestId null when Seerr returns no id", async () => {
    tmdbGetDetails.mockResolvedValue({ name: "Shogun" });
    sendRequest.mockResolvedValue({});

    await handleRandomRequestButton(makeInteraction("random_request_125988_tv"));

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null, mediaType: "tv", title: "Shogun" })
    );
  });
});
