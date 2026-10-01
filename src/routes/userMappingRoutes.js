import { Router } from "express";
import { authenticateToken } from "../utils/auth.js";
import { validateBody, userMappingSchema } from "../utils/validation.js";
import {
  getUserMappings,
  saveUserMapping,
  deleteUserMapping,
  deleteAllUserMappings,
  loadConfigToEnv,
} from "../utils/configFile.js";
import logger from "../utils/logger.js";

const router = Router();

/**
 * Returns all user mappings (Discord ↔ Seerr).
 * SECURITY NOTE: Admin-only endpoint. Currently enforced by the single-user
 * registration model (only one account can exist). If multi-user support is
 * added in the future, this endpoint MUST be restricted to an admin role.
 */
router.get("/user-mappings", authenticateToken, (req, res) => {
  const mappings = getUserMappings();
  res.json(mappings);
});

router.post(
  "/user-mappings",
  authenticateToken,
  validateBody(userMappingSchema),
  (req, res) => {
    const {
      discordUserId,
      seerrUserId,
      discordUsername,
      discordDisplayName,
      seerrDisplayName,
    } = req.body;

    if (!discordUserId || !seerrUserId) {
      return res.status(400).json({
        success: false,
        messageKey: "api.mapping_ids_required",
      });
    }

    try {
      const mapping = {
        discordUserId,
        seerrUserId,
        discordUsername: discordUsername || null,
        discordDisplayName: discordDisplayName || null,
        seerrDisplayName: seerrDisplayName || null,
      };

      saveUserMapping(mapping);
      loadConfigToEnv();

      res.json({ success: true, messageKey: "api.mapping_saved" });
    } catch (error) {
      logger.error("Error saving user mapping:", error);
      res.status(500).json({
        success: false,
        messageKey: "api.mapping_save_failed",
      });
    }
  }
);

// IMPORTANT: must be registered BEFORE the /:discordUserId route, otherwise
// Express would match "all" as a discordUserId param.
router.delete("/user-mappings/all", authenticateToken, (req, res) => {
  try {
    const removed = deleteAllUserMappings();
    loadConfigToEnv();
    res.json({ success: true, removed, messageKey: "api.mappings_removed", messageParams: { count: removed } });
  } catch (error) {
    logger.error("Error clearing user mappings:", error);
    res.status(500).json({
      success: false,
      messageKey: "api.mappings_clear_failed",
    });
  }
});

router.delete("/user-mappings/:discordUserId", authenticateToken, (req, res) => {
  const { discordUserId } = req.params;

  try {
    const deleted = deleteUserMapping(discordUserId);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, messageKey: "api.mapping_not_found" });
    }

    loadConfigToEnv();

    res.json({ success: true, messageKey: "api.mapping_deleted" });
  } catch (error) {
    logger.error("Error deleting user mapping:", error);
    res.status(500).json({
      success: false,
      messageKey: "api.mapping_delete_failed",
    });
  }
});

export default router;
