import { describe, it, expect, vi, beforeEach } from "vitest";

// Command/handler modules — each export stubbed so we can assert which one the
// dispatcher routed to.
const h = {
  search: vi.fn(), status: vi.fn(), random: vi.fn(), watchlist: vi.fn(), wlPage: vi.fn(),
  upcoming: vi.fn(), upPage: vi.fn(), history: vi.fn(), recommend: vi.fn(), foryou: vi.fn(),
  help: vi.fn(), discover: vi.fn(), collection: vi.fn(), cast: vi.fn(), castPage: vi.fn(),
  similar: vi.fn(), queue: vi.fn(), autocomplete: vi.fn(),
};

vi.mock("../bot/commands/search.js", () => ({ handleSearchOrRequest: h.search }));
vi.mock("../bot/commands/status.js", () => ({ handleStatusCommand: h.status }));
vi.mock("../bot/commands/random.js", () => ({ handleRandomCommand: h.random }));
vi.mock("../bot/commands/watchlist.js", () => ({ handleWatchlistCommand: h.watchlist, handleWatchlistPagination: h.wlPage }));
vi.mock("../bot/commands/upcoming.js", () => ({ handleUpcomingCommand: h.upcoming, handleUpcomingPagination: h.upPage }));
vi.mock("../bot/commands/history.js", () => ({ handleHistoryCommand: h.history }));
vi.mock("../bot/commands/recommend.js", () => ({ handleRecommendCommand: h.recommend }));
vi.mock("../bot/commands/foryou.js", () => ({ handleForYouCommand: h.foryou }));
vi.mock("../bot/commands/help.js", () => ({ handleHelpCommand: h.help }));
vi.mock("../bot/handlers/wizardButton.js", () => ({ handleWizardButton: vi.fn() }));
vi.mock("../bot/handlers/wizardSearchModal.js", () => ({ showWizardSearchModal: vi.fn(), handleWizardModalSubmit: vi.fn(), WIZARD_DIRECT_MODAL_BUTTON_IDS: [] }));
vi.mock("../bot/handlers/didYouMean.js", () => ({ handleDymYes: vi.fn(), handleDymNo: vi.fn(), handleDymPick: vi.fn() }));
vi.mock("../bot/handlers/wizardSmartPicker.js", () => ({ showWizardSmartPicker: vi.fn(), handleSmartPickerSelect: vi.fn(), PICKER_BUTTON_IDS: [] }));
vi.mock("../bot/handlers/actionButton.js", () => ({ handleActionButton: vi.fn(), handleActionCastPick: vi.fn() }));
vi.mock("../bot/commands/discover.js", () => ({ handleDiscoverCommand: h.discover }));
vi.mock("../bot/commands/collection.js", () => ({ handleCollectionCommand: h.collection, buildCollectionReply: vi.fn() }));
vi.mock("../bot/commands/cast.js", () => ({ handleCastCommand: h.cast, handleCastPagination: h.castPage }));
vi.mock("../bot/commands/similar.js", () => ({ handleSimilarCommand: h.similar }));
vi.mock("../bot/commands/queue.js", () => ({ handleQueueCommand: h.queue }));
vi.mock("../bot/autocomplete/index.js", () => ({ handleAutocomplete: h.autocomplete }));
vi.mock("../bot/handlers/requestButton.js", () => ({ handleRequestButton: vi.fn() }));
vi.mock("../bot/handlers/statusRequestButton.js", () => ({ handleStatusRequestButton: vi.fn() }));
vi.mock("../bot/handlers/randomRequestButton.js", () => ({ handleRandomRequestButton: vi.fn() }));
vi.mock("../bot/handlers/seasonSelect.js", () => ({ handleSeasonSelect: vi.fn() }));
vi.mock("../bot/handlers/tagSelect.js", () => ({ handleTagSelect: vi.fn() }));
vi.mock("../bot/handlers/requestedButton.js", () => ({ handleRequestedButton: vi.fn() }));
vi.mock("../bot/handlers/seerrApproveDecline.js", () => ({ handleSeerrApproveDecline: vi.fn() }));
vi.mock("../bot/cleanupAdvisor.js", () => ({ handleCleanupPagination: vi.fn() }));

const checkRolePermission = vi.fn(() => true);
const checkCommandRateLimit = vi.fn(() => true);
const getSeerrUrl = vi.fn(() => "http://seerr");
const getSeerrApiKey = vi.fn(() => "key");
const getTmdbApiKey = vi.fn(() => "tmdb");
vi.mock("../bot/botUtils.js", () => ({ getOptionStringRobust: vi.fn(() => ""), checkRolePermission }));
vi.mock("../bot/helpers.js", () => ({ getSeerrUrl, getSeerrApiKey, getTmdbApiKey }));
vi.mock("../bot/commandRateLimit.js", () => ({ checkCommandRateLimit }));
vi.mock("../bot/commandStats.js", () => ({ trackCommand: vi.fn() }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { registerInteractions } = await import("../bot/interactions.js");

// Capture the interactionCreate handler the module registers.
let handler;
registerInteractions({ on: (evt, fn) => { if (evt === "interactionCreate") handler = fn; } });

const base = () => ({
  isCommand: () => false, isButton: () => false, isStringSelectMenu: () => false,
  isAutocomplete: () => false, isModalSubmit: () => false,
  member: {}, user: { id: "u1", username: "bob", displayAvatarURL: () => "url" },
  options: { getString: () => null }, reply: vi.fn(),
});
const cmd = (commandName) => ({ ...base(), isCommand: () => true, commandName });

beforeEach(() => {
  vi.clearAllMocks();
  checkRolePermission.mockReturnValue(true);
  checkCommandRateLimit.mockReturnValue(true);
  getSeerrUrl.mockReturnValue("http://seerr");
  getSeerrApiKey.mockReturnValue("key");
  getTmdbApiKey.mockReturnValue("tmdb");
});

describe("interactions command dispatch", () => {
  it("routes /search to handleSearchOrRequest", async () => {
    await handler(cmd("search"));
    expect(h.search).toHaveBeenCalledTimes(1);
  });

  it("routes /queue to handleQueueCommand", async () => {
    await handler(cmd("queue"));
    expect(h.queue).toHaveBeenCalledTimes(1);
  });

  it("routes /similar to handleSimilarCommand", async () => {
    await handler(cmd("similar"));
    expect(h.similar).toHaveBeenCalledTimes(1);
  });

  it("handles /help before the backend-config gate", async () => {
    getSeerrUrl.mockReturnValue(""); // config missing
    const interaction = cmd("help");
    await handler(interaction);
    expect(h.help).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("replies config_missing (and routes nowhere) when backend config is absent", async () => {
    getSeerrUrl.mockReturnValue("");
    const interaction = cmd("search");
    await handler(interaction);
    expect(h.search).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "command_config_missing" }));
  });

  it("routes autocomplete interactions to handleAutocomplete", async () => {
    const interaction = { ...base(), isAutocomplete: () => true };
    await handler(interaction);
    expect(h.autocomplete).toHaveBeenCalledTimes(1);
  });
});

describe("interactions pre-checks", () => {
  it("blocks a command with no role permission (replies, routes nowhere)", async () => {
    checkRolePermission.mockReturnValue(false);
    const interaction = cmd("search");
    await handler(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "no_permission" }));
    expect(h.search).not.toHaveBeenCalled();
  });

  it("rate-limits a command (replies rate_limited, routes nowhere)", async () => {
    checkCommandRateLimit.mockReturnValue(false);
    const interaction = cmd("search");
    await handler(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "rate_limited" }));
    expect(h.search).not.toHaveBeenCalled();
  });
});
