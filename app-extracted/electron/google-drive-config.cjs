let packagedCredentials = {};
try { packagedCredentials = require("./google-drive-production.json"); } catch { packagedCredentials = {}; }
const embeddedClientId = packagedCredentials.clientId || "";
const embeddedClientSecret = packagedCredentials.clientSecret || "";

module.exports = {
  // Add the published Google OAuth 2.0 Desktop credentials before public distribution.
  // The school signs in directly with Google; no Google password is handled by this app.
  clientId: embeddedClientId || process.env.BHARAT_AI_GOOGLE_CLIENT_ID || "",
  clientSecret: embeddedClientSecret || process.env.BHARAT_AI_GOOGLE_CLIENT_SECRET || "",
};
