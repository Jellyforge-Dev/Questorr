import { describe, it, expect, vi, beforeEach } from "vitest";

const add = vi.fn();
const sendRequest = vi.fn();
const checkMediaStatus = vi.fn();
const tmdbGetDetails = vi.fn();
const tmdbGetExternalImdb = vi.fn();
const getQuotaDenial = vi.fn(() => null);

vi.mock("../utils/requestStore.js", () => ({ add }));
vi.mock("../api/seerr.js", () => ({
  sendRequest,
  checkMediaStatus,
  fetchTags: vi.fn(),
}));
vi.mock("../api/tmdb.js", () => ({ tmdbGetDetails, tmdbGetExternalImdb }));
vi.mock("../api/omdb.js", () => ({ fetchOMDbData: vi.fn(() => null) }));
vi.mock("../bot/embeds.js", () => ({
  buildNotificationEmbed: vi.fn(() => ({})),
  buildButtons: vi.fn(() => []),
}));
vi.mock("../bot/botUtils.js", () => ({
  parseQualityAndServerOptions: vi.fn(() => ({ profileId: null, serverId: null })),
  getSeerrAutoApprove: vi.fn(() => false),
  getQuotaDenial,
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

const { handleRequestButton } = await import("../bot/handlers/requestButton.js");

function makeInteraction(customId) {
  return {
    customId,
    user: { id: "discord-user-1" },
    deferUpdate: vi.fn(),
    reply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkMediaStatus.mockResolvedValue({ exists: false, available: false });
  tmdbGetExternalImdb.mockResolvedValue(null);
  getQuotaDenial.mockReturnValue(null);
});

describe("handleRequestButton → quota", () => {
  it("rejects with the denial message and does not request when over quota", async () => {
    getQuotaDenial.mockReturnValueOnce("⚠️ limit reached");
    const interaction = makeInteraction("request|693134|movie||");

    await handleRequestButton(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith({ content: "⚠️ limit reached", flags: 64 });
    expect(sendRequest).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});

describe("handleRequestButton → requestStore.add", () => {
  it("records the created Seerr requestId in the store after a movie request", async () => {
    tmdbGetDetails.mockResolvedValue({ title: "Dune: Part Two" });
    sendRequest.mockResolvedValue({ id: 4242 });

    await handleRequestButton(makeInteraction("request|693134|movie||"));

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({
      requestId: 4242,
      tmdbId: 693134,
      mediaType: "movie",
      title: "Dune: Part Two",
      discordUserId: "discord-user-1",
    });
  });

  it("uses the series name as the title for tv requests", async () => {
    tmdbGetDetails.mockResolvedValue({ name: "Shogun", seasons: [] });
    sendRequest.mockResolvedValue({ id: 99 });

    await handleRequestButton(makeInteraction("request|125988|tv||"));

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 99, mediaType: "tv", title: "Shogun" })
    );
  });

  it("passes requestId null when Seerr returns no id (older Seerr)", async () => {
    tmdbGetDetails.mockResolvedValue({ title: "Madame Web" });
    sendRequest.mockResolvedValue({});

    await handleRequestButton(makeInteraction("request|634492|movie||"));

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: null, title: "Madame Web" })
    );
  });

  it("does not record anything when the title is already available", async () => {
    checkMediaStatus.mockResolvedValue({ exists: true, available: true });
    tmdbGetDetails.mockResolvedValue({ title: "Already Here" });

    await handleRequestButton(makeInteraction("request|1|movie||"));

    expect(sendRequest).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
