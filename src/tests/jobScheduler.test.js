import { describe, it, expect, vi, beforeEach } from "vitest";

const scheduleDailyRandomPick = vi.fn();
const scheduleDailyRecommendation = vi.fn();
const scheduleCleanupAdvisor = vi.fn();
const scheduleWeeklyRecommendation = vi.fn();
const scheduleWeeklyDigest = vi.fn();
const startSubscriptionPoller = vi.fn();

vi.mock("../bot/dailyPick.js", () => ({ scheduleDailyRandomPick, scheduleDailyRecommendation }));
vi.mock("../bot/cleanupAdvisor.js", () => ({ scheduleCleanupAdvisor }));
vi.mock("../bot/weeklyRecommendation.js", () => ({ scheduleWeeklyRecommendation }));
vi.mock("../bot/weeklyDigest.js", () => ({ scheduleWeeklyDigest }));
vi.mock("../bot/subscriptionPoller.js", () => ({ startSubscriptionPoller }));
vi.mock("../utils/logger.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { rescheduleTimedJobs } = await import("../bot/jobScheduler.js");

beforeEach(() => vi.clearAllMocks());

describe("rescheduleTimedJobs", () => {
  it("invokes every config-driven cron scheduler with the client", () => {
    const client = { tag: "bot" };
    rescheduleTimedJobs(client);

    expect(scheduleDailyRandomPick).toHaveBeenCalledWith(client);
    expect(scheduleDailyRecommendation).toHaveBeenCalledWith(client);
    expect(scheduleCleanupAdvisor).toHaveBeenCalledWith(client);
    expect(scheduleWeeklyRecommendation).toHaveBeenCalledWith(client);
    expect(scheduleWeeklyDigest).toHaveBeenCalledWith(client);
    expect(startSubscriptionPoller).toHaveBeenCalledTimes(1);
  });

  it("is safe to call repeatedly (idempotent reschedule)", () => {
    const client = { tag: "bot" };
    rescheduleTimedJobs(client);
    rescheduleTimedJobs(client);
    expect(scheduleWeeklyDigest).toHaveBeenCalledTimes(2);
  });
});
