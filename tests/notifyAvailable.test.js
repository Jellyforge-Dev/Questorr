import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchRequests = vi.fn();
const updateFromSeerr = vi.fn(() => []);
const isNotifyEnabled = vi.fn();

vi.mock("../api/seerr.js", () => ({ fetchRequests }));
vi.mock("../utils/requestStore.js", () => ({ updateFromSeerr }));
vi.mock("../utils/notifyPrefs.js", () => ({ isNotifyEnabled }));
vi.mock("../seerrWebhook.js", () => ({
  sendRequesterDm: vi.fn(),
  getAdminPendingMsg: vi.fn(() => null),
  removeAdminPendingMsg: vi.fn(),
}));
vi.mock("../utils/notifyDedup.js", () => ({ wasRecentlyNotified: vi.fn(() => false), markNotified: vi.fn() }));
vi.mock("../utils/botStrings.js", () => ({ t: (k, vars) => (vars ? `${k}:${vars.title}` : k) }));
vi.mock("../utils/logger.js", () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { notifyAvailableTransitions } = await import("../bot/seerrStatusPoller.js");

function makeClient(send) {
  return { users: { fetch: vi.fn(async () => ({ send })) } };
}

beforeEach(() => vi.clearAllMocks());

describe("notifyAvailableTransitions", () => {
  it("DMs the requester when their item became Available and they opted in", async () => {
    isNotifyEnabled.mockReturnValue(true);
    const send = vi.fn();
    const client = makeClient(send);

    const transitions = [
      { from: "Processing", to: "Available", record: { discordUserId: "u1", title: "Dune", tmdbId: 1 } },
    ];
    await notifyAvailableTransitions(transitions, client);

    expect(client.users.fetch).toHaveBeenCalledWith("u1");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not DM users who did not opt in", async () => {
    isNotifyEnabled.mockReturnValue(false);
    const send = vi.fn();
    await notifyAvailableTransitions(
      [{ from: "Processing", to: "Available", record: { discordUserId: "u2", title: "X" } }],
      makeClient(send)
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores transitions that are not into Available", async () => {
    isNotifyEnabled.mockReturnValue(true);
    const send = vi.fn();
    await notifyAvailableTransitions(
      [{ from: "Pending", to: "Processing", record: { discordUserId: "u3", title: "Y" } }],
      makeClient(send)
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("is a no-op without a client", async () => {
    isNotifyEnabled.mockReturnValue(true);
    await expect(
      notifyAvailableTransitions([{ from: "Processing", to: "Available", record: { discordUserId: "u4" } }], null)
    ).resolves.toBeUndefined();
  });
});
