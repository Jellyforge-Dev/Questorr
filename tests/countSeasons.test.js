import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../utils/axiosRetry.js", () => ({ withRetry: (fn) => fn() }));
vi.mock("../utils/logger.js", () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import axios from "axios";
import { countSeriesSeasonsInJellyfin } from "../api/jellyfin.js";

beforeEach(() => vi.clearAllMocks());

describe("countSeriesSeasonsInJellyfin", () => {
  it("returns the count of real seasons (excludes Specials / index 0)", async () => {
    // 1) item lookup → series found
    axios.get.mockResolvedValueOnce({ data: { Items: [{ Id: "series-1", ProviderIds: { Tmdb: "1399" } }] } });
    // 2) season children
    axios.get.mockResolvedValueOnce({
      data: { Items: [{ IndexNumber: 0 }, { IndexNumber: 1 }, { IndexNumber: 2 }, { IndexNumber: 3 }] },
    });
    expect(await countSeriesSeasonsInJellyfin(1399, "key", "http://jf")).toBe(3);
  });

  it("returns null when the series is not in the library", async () => {
    axios.get.mockResolvedValueOnce({ data: { Items: [] } }); // not found
    expect(await countSeriesSeasonsInJellyfin(1399, "key", "http://jf")).toBeNull();
  });

  it("returns null on error", async () => {
    axios.get.mockRejectedValue(new Error("boom"));
    expect(await countSeriesSeasonsInJellyfin(1399, "key", "http://jf")).toBeNull();
  });
});
