import { describe, it, expect, vi, beforeEach } from "vitest";

const getByUser = vi.fn();
const updateFromSeerr = vi.fn();
const backfillFromSeerr = vi.fn();
const fetchSeerrUserRequestsFull = vi.fn();
const fetchRequests = vi.fn();

vi.mock("../utils/requestStore.js", () => ({
  getByUser,
  updateFromSeerr,
  backfillFromSeerr,
  STAGES: {
    PENDING: "Pending",
    PROCESSING: "Processing",
    AVAILABLE: "Available",
    PARTIALLY_AVAILABLE: "PartiallyAvailable",
    DECLINED: "Declined",
    FAILED: "Failed",
  },
}));
vi.mock("../api/seerr.js", () => ({ fetchSeerrUserRequestsFull, fetchRequests }));
vi.mock("../bot/helpers.js", () => ({
  getSeerrUrl: vi.fn(() => "http://seerr"),
  getSeerrApiKey: vi.fn(() => "key"),
}));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { buildQueueEmbed, handleQueueCommand } = await import("../bot/commands/queue.js");

function makeInteraction() {
  return {
    user: { id: "discord-user-1" },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.USER_MAPPINGS;
});

describe("buildQueueEmbed", () => {
  it("groups records by stage in pipeline order and skips empty stages", () => {
    const records = [
      { title: "Madame Web", mediaType: "movie", stage: "Declined" },
      { title: "Dune", mediaType: "movie", stage: "Pending" },
      { title: "Shogun", mediaType: "tv", stage: "Processing" },
    ];

    const embed = buildQueueEmbed(records);
    const desc = embed.data.description;

    // Pending appears before Processing before Declined.
    expect(desc.indexOf("queue_stage_pending")).toBeLessThan(desc.indexOf("queue_stage_processing"));
    expect(desc.indexOf("queue_stage_processing")).toBeLessThan(desc.indexOf("queue_stage_declined"));
    // No Available/Partial group rendered (none present).
    expect(desc).not.toContain("queue_stage_available");
    expect(desc).toContain("Dune");
    expect(desc).toContain("Shogun");
  });

  it("labels media type and falls back to TMDB id when title is missing", () => {
    const embed = buildQueueEmbed([{ title: null, tmdbId: 999, mediaType: "movie", stage: "Pending" }]);
    expect(embed.data.description).toContain("999");
  });

  it("renders a Failed group last", () => {
    const records = [
      { title: "Broken Movie", mediaType: "movie", stage: "Failed" },
      { title: "Dune", mediaType: "movie", stage: "Pending" },
    ];
    const desc = buildQueueEmbed(records).data.description;
    expect(desc).toContain("queue_stage_failed");
    expect(desc).toContain("Broken Movie");
    expect(desc.indexOf("queue_stage_pending")).toBeLessThan(desc.indexOf("queue_stage_failed"));
  });
});

describe("handleQueueCommand", () => {
  it("replies with the empty message when the store has no records", async () => {
    getByUser.mockReturnValue([]);
    fetchRequests.mockResolvedValue({ results: [] });
    const interaction = makeInteraction();

    await handleQueueCommand(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: "queue_empty" });
  });

  it("reconciles via the requestedBy filter for mapped users", async () => {
    process.env.USER_MAPPINGS = JSON.stringify([
      { discordUserId: "discord-user-1", seerrUserId: 42 },
    ]);
    const mappedResults = [{ id: 1, status: 1, media: { status: 1 } }];
    fetchSeerrUserRequestsFull.mockResolvedValue(mappedResults);
    getByUser.mockReturnValue([{ title: "Dune", mediaType: "movie", stage: "Pending" }]);
    const interaction = makeInteraction();

    await handleQueueCommand(interaction);

    expect(fetchSeerrUserRequestsFull).toHaveBeenCalledWith(42, "http://seerr", "key", 100);
    expect(fetchRequests).not.toHaveBeenCalled();
    expect(updateFromSeerr).toHaveBeenCalledTimes(1);
    // Backfill untracked requests for this (mapped, attributable) user.
    expect(backfillFromSeerr).toHaveBeenCalledWith(mappedResults, "discord-user-1");
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) })
    );
  });

  it("reconciles via the global recent fetch for unmapped users", async () => {
    fetchRequests.mockResolvedValue({ results: [{ id: 5, status: 2, media: { status: 5 } }] });
    getByUser.mockReturnValue([{ title: "Fallout", mediaType: "tv", stage: "Available" }]);
    const interaction = makeInteraction();

    await handleQueueCommand(interaction);

    expect(fetchRequests).toHaveBeenCalledWith("http://seerr", "key", 100, "all");
    expect(fetchSeerrUserRequestsFull).not.toHaveBeenCalled();
    expect(updateFromSeerr).toHaveBeenCalledTimes(1);
    // No backfill for unmapped users — global results aren't attributable.
    expect(backfillFromSeerr).not.toHaveBeenCalled();
  });
});
