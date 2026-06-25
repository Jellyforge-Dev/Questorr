import { describe, it, expect, vi, beforeEach } from "vitest";

const handleQueueCommand = vi.fn();

vi.mock("../bot/commands/queue.js", () => ({ handleQueueCommand }));
vi.mock("../bot/commands/foryou.js", () => ({ handleForYouCommand: vi.fn() }));
vi.mock("../bot/commands/random.js", () => ({ handleRandomCommand: vi.fn() }));
vi.mock("../bot/commands/watchlist.js", () => ({ handleWatchlistCommand: vi.fn() }));
vi.mock("../bot/commands/history.js", () => ({ handleHistoryCommand: vi.fn() }));
vi.mock("../bot/commands/upcoming.js", () => ({ handleUpcomingCommand: vi.fn() }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { buildHelpComponents } = await import("../bot/helpers/helpMessage.js");
const { handleWizardButton } = await import("../bot/handlers/wizardButton.js");

function customIds(rows) {
  return rows.flatMap((row) => row.components.map((c) => c.data.custom_id));
}

beforeEach(() => vi.clearAllMocks());

describe("help wizard /queue button", () => {
  it("includes a wizard_queue button in the help components", () => {
    expect(customIds(buildHelpComponents())).toContain("wizard_queue");
  });

  it("routes the wizard_queue button click to handleQueueCommand", async () => {
    await handleWizardButton({ customId: "wizard_queue", user: { id: "u1" } });
    expect(handleQueueCommand).toHaveBeenCalledTimes(1);
  });
});
