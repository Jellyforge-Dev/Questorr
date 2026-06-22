import { describe, it, expect, vi, beforeEach } from "vitest";

const toggleNotify = vi.fn();
vi.mock("../utils/notifyPrefs.js", () => ({ toggleNotify }));
vi.mock("../utils/botStrings.js", () => ({ t: (k) => k }));

const { handleNotifyCommand } = await import("../bot/commands/notify.js");

const makeInteraction = () => ({ user: { id: "u1" }, reply: vi.fn() });

beforeEach(() => vi.clearAllMocks());

describe("handleNotifyCommand", () => {
  it("enables notifications and confirms (ephemeral)", async () => {
    toggleNotify.mockReturnValue(true);
    const interaction = makeInteraction();
    await handleNotifyCommand(interaction);
    expect(toggleNotify).toHaveBeenCalledWith("u1");
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "notify_enabled", flags: 64 }));
  });

  it("disables notifications and confirms", async () => {
    toggleNotify.mockReturnValue(false);
    const interaction = makeInteraction();
    await handleNotifyCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "notify_disabled", flags: 64 }));
  });
});
