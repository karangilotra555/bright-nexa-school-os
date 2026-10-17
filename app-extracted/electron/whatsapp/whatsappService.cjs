/**
 * Bright Nexa — School OS
 * WhatsApp Cloud API Integration Service
 * 
 * Developed by Karan Gilotra (Bright Nexa)
 * 
 * Supports official Meta WhatsApp Cloud API:
 * - Fee Due & Overdue Reminders
 * - Student Attendance / Absent Alerts
 * - Fee Payment Receipts
 * - School Circulars & Holiday Notices
 * - Test / Simulation Mode (safe fallback when credentials aren't set)
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const CONFIG_PATH = path.join(__dirname, "whatsapp-config.json");
const CONFIG_EXAMPLE_PATH = path.join(__dirname, "whatsapp-config.json.example");
const LOG_PATH = path.join(__dirname, "whatsapp-sent-log.json");

/**
 * Load active WhatsApp configuration with fallback to defaults
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch (err) {
    console.error("[WhatsApp] Error loading config:", err.message);
  }

  // Fallback defaults
  return {
    enabled: false,
    mockMode: true,
    schoolName: "Bright Nexa School",
    phoneNumberId: "",
    accessToken: "",
    templates: {
      feeReminder: "bright_nexa_fee_reminder",
      feeReceipt: "bright_nexa_fee_receipt",
      absentAlert: "bright_nexa_student_absent",
      schoolNotice: "bright_nexa_general_notice"
    }
  };
}

/**
 * Save updated WhatsApp configuration
 */
function saveConfig(patch) {
  try {
    const current = loadConfig();
    const updated = { ...current, ...patch };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf8");
    return { success: true, config: updated };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clean phone numbers to standard E.164 without '+' or spaces (e.g. 917500058655)
 */
function sanitizePhoneNumber(phone) {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned; // default to India country code
  }
  return cleaned;
}

/**
 * Log sent message for audit trail and duplicate prevention
 */
function appendLog(entry) {
  try {
    let logs = [];
    if (fs.existsSync(LOG_PATH)) {
      logs = JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
    }
    logs.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
    // Keep last 1000 logs
    if (logs.length > 1000) logs = logs.slice(-1000);
    fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2), "utf8");
  } catch (err) {
    console.error("[WhatsApp Log] Error writing log:", err.message);
  }
}

/**
 * Make HTTPS request to Meta Graph API
 */
function callMetaGraphApi(endpoint, payload, accessToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://graph.facebook.com/v21.0/${endpoint}`);
    const data = JSON.stringify(payload);

    const options = {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const req = https.request(url, options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: parsed, statusCode: res.statusCode });
          } else {
            resolve({ success: false, error: parsed.error?.message || responseBody, statusCode: res.statusCode });
          }
        } catch (e) {
          resolve({ success: false, error: responseBody || e.message, statusCode: res.statusCode });
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.write(data);
    req.end();
  });
}

/**
 * Send WhatsApp Template Message via Meta Cloud API
 */
async function sendTemplateMessage({ recipientPhone, templateName, languageCode = "en", components = [] }) {
  const config = loadConfig();
  const phone = sanitizePhoneNumber(recipientPhone);

  if (!phone) {
    return { success: false, error: "Invalid recipient phone number" };
  }

  // If credentials are not yet configured, run in Mock / Simulation Mode
  if (!config.enabled || !config.accessToken || !config.phoneNumberId) {
    const mockRecord = {
      recipientPhone: phone,
      templateName,
      languageCode,
      components,
      mock: true,
      delivered: true,
      note: "Simulation Mode: Meta WhatsApp credentials not yet configured in whatsapp-config.json."
    };
    appendLog(mockRecord);
    return {
      success: true,
      mock: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      note: mockRecord.note
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components
    }
  };

  try {
    const result = await callMetaGraphApi(`${config.phoneNumberId}/messages`, payload, config.accessToken);
    appendLog({
      recipientPhone: phone,
      templateName,
      payload,
      result
    });
    return result;
  } catch (err) {
    appendLog({
      recipientPhone: phone,
      templateName,
      error: err.message
    });
    return { success: false, error: err.message };
  }
}

/**
 * High-Level Helper: Send Student Fee Due Reminder
 */
async function sendFeeDueReminder({ studentName, parentPhone, dueAmount, dueDate, schoolName }) {
  const config = loadConfig();
  const templateName = config.templates?.feeReminder || "bright_nexa_fee_reminder";
  const effectiveSchool = schoolName || config.schoolName || "Bright Nexa School";

  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: studentName || "Student" },
        { type: "text", text: String(dueAmount || "0") },
        { type: "text", text: String(dueDate || "end of month") },
        { type: "text", text: effectiveSchool }
      ]
    }
  ];

  return sendTemplateMessage({
    recipientPhone: parentPhone,
    templateName,
    components
  });
}

/**
 * High-Level Helper: Send Student Absent Notification
 */
async function sendAbsentAlert({ studentName, parentPhone, date, schoolName }) {
  const config = loadConfig();
  const templateName = config.templates?.absentAlert || "bright_nexa_student_absent";
  const effectiveSchool = schoolName || config.schoolName || "Bright Nexa School";
  const alertDate = date || new Date().toLocaleDateString("en-IN");

  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: studentName || "Student" },
        { type: "text", text: alertDate },
        { type: "text", text: effectiveSchool }
      ]
    }
  ];

  return sendTemplateMessage({
    recipientPhone: parentPhone,
    templateName,
    components
  });
}

/**
 * High-Level Helper: Send Fee Payment Confirmation Receipt
 */
async function sendPaymentReceiptNotification({ studentName, parentPhone, receiptNo, amount, date, schoolName }) {
  const config = loadConfig();
  const templateName = config.templates?.feeReceipt || "bright_nexa_fee_receipt";
  const effectiveSchool = schoolName || config.schoolName || "Bright Nexa School";

  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: studentName || "Student" },
        { type: "text", text: String(receiptNo || "REC-001") },
        { type: "text", text: `INR ${amount || "0"}` },
        { type: "text", text: String(date || new Date().toLocaleDateString("en-IN")) },
        { type: "text", text: effectiveSchool }
      ]
    }
  ];

  return sendTemplateMessage({
    recipientPhone: parentPhone,
    templateName,
    components
  });
}

module.exports = {
  loadConfig,
  saveConfig,
  sendTemplateMessage,
  sendFeeDueReminder,
  sendAbsentAlert,
  sendPaymentReceiptNotification
};
