import { describe, it, expect } from "vitest";
import { migrateNotifyOnAvailable } from "../utils/configFile.js";

describe("migrateNotifyOnAvailable", () => {
  it("bumps a stored 'false' (old default) to 'true' and sets the marker", () => {
    const config = { NOTIFY_ON_AVAILABLE: "false" };
    const changed = migrateNotifyOnAvailable(config);
    expect(changed).toBe(true);
    expect(config.NOTIFY_ON_AVAILABLE).toBe("true");
    expect(config.NOTIFY_ON_AVAILABLE_MIGRATED).toBe(true);
  });

  it("also handles a boolean false", () => {
    const config = { NOTIFY_ON_AVAILABLE: false };
    migrateNotifyOnAvailable(config);
    expect(config.NOTIFY_ON_AVAILABLE).toBe("true");
  });

  it("sets the marker without changing an already-'true' value", () => {
    const config = { NOTIFY_ON_AVAILABLE: "true" };
    const changed = migrateNotifyOnAvailable(config);
    expect(changed).toBe(true); // marker newly set → caller persists
    expect(config.NOTIFY_ON_AVAILABLE).toBe("true");
    expect(config.NOTIFY_ON_AVAILABLE_MIGRATED).toBe(true);
  });

  it("does NOT re-bump a deliberate 'false' once the marker is set", () => {
    // User turned the availability DM off AFTER the gate was fixed.
    const config = { NOTIFY_ON_AVAILABLE: "false", NOTIFY_ON_AVAILABLE_MIGRATED: true };
    const changed = migrateNotifyOnAvailable(config);
    expect(changed).toBe(false); // no-op, no persist
    expect(config.NOTIFY_ON_AVAILABLE).toBe("false"); // choice preserved
  });

  it("is a no-op (besides reporting) when already migrated and 'true'", () => {
    const config = { NOTIFY_ON_AVAILABLE: "true", NOTIFY_ON_AVAILABLE_MIGRATED: true };
    expect(migrateNotifyOnAvailable(config)).toBe(false);
  });
});
