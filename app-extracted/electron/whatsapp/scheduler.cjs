/**
 * Bright Nexa — School OS
 * Automated WhatsApp Background Scheduler
 * 
 * Developed by Karan Gilotra (Bright Nexa)
 * 
 * Periodically checks:
 * 1. Daily morning attendance status to notify parents of absent students.
 * 2. Fee due dates (e.g. 3 days before due date and on due date).
 * 3. Prevents duplicate messages via execution log checks.
 */

const { loadConfig, sendFeeDueReminder, sendAbsentAlert } = require("./whatsappService.cjs");

let schedulerTimer = null;
let isRunningCheck = false;

/**
 * Run scheduler cycle
 */
async function runScheduledChecks(dataProvider = null) {
  if (isRunningCheck) return;
  isRunningCheck = true;

  try {
    const config = loadConfig();
    if (!config.enabled && !config.mockMode) {
      isRunningCheck = false;
      return;
    }

    console.log("[WhatsApp Scheduler] Checking pending reminders at:", new Date().toLocaleTimeString());

    // If dataProvider is attached (e.g. by Electron main process from database/store), process queue
    if (typeof dataProvider === "function") {
      const pendingReminders = await dataProvider();
      if (Array.isArray(pendingReminders)) {
        for (const item of pendingReminders) {
          if (item.type === "fee_reminder") {
            await sendFeeDueReminder(item);
          } else if (item.type === "absent_alert") {
            await sendAbsentAlert(item);
          }
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp Scheduler] Error running check:", err.message);
  } finally {
    isRunningCheck = false;
  }
}

/**
 * Start the background scheduler
 * @param {number} intervalMs - Interval between checks (default: every 30 minutes)
 * @param {Function} dataProvider - Optional hook to fetch pending reminder records
 */
function startScheduler(intervalMs = 30 * 60 * 1000, dataProvider = null) {
  if (schedulerTimer) clearInterval(schedulerTimer);
  
  console.log(`[WhatsApp Scheduler] Started with interval: ${intervalMs / 1000}s`);
  // Run once immediately after 10s
  setTimeout(() => runScheduledChecks(dataProvider), 10000);
  
  // Set recurring interval
  schedulerTimer = setInterval(() => runScheduledChecks(dataProvider), intervalMs);
}

/**
 * Stop background scheduler
 */
function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[WhatsApp Scheduler] Stopped.");
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runScheduledChecks
};
