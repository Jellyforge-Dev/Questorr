import logger from "./logger.js";

/**
 * Wraps an axios call with a single retry on transient failures.
 * Retries on: network errors, 502, 503, 504, ECONNRESET, ETIMEDOUT.
 *
 * @param {Function} fn - Async function that performs the axios call
 * @param {Object} [opts]
 * @param {number} [opts.retries=1] - Number of retries
 * @param {number} [opts.delay=2000] - Delay between retries in ms
 * @param {string} [opts.label="API call"] - Label for log messages
 * @returns {Promise<*>} Result of fn()
 */
export async function withRetry(fn, opts = {}) {
  const { retries = 1, delay = 2000, label = "API call" } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt >= retries;

      if (isLastAttempt || !isRetryable(err)) {
        throw err;
      }

      logger.debug(
        `[RETRY] ${label} failed (${describeError(err)}), retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }
}

function isRetryable(err) {
  // Network-level errors
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
    return true;
  }
  // Server errors that are typically transient
  const status = err.response?.status;
  if (status === 502 || status === 503 || status === 504 || status === 429) {
    return true;
  }
  return false;
}

function describeError(err) {
  if (err.response?.status) return `HTTP ${err.response.status}`;
  if (err.code) return err.code;
  return err.message;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
