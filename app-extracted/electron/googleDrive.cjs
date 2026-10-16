const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { clientId: embeddedClientId, clientSecret: embeddedClientSecret } = require("./google-drive-config.cjs");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const SCOPES = `openid email ${DRIVE_SCOPE}`;
const PRODUCT_KEY = "bharat-ai-school-os";

function registerGoogleDriveHandlers({ ipcMain, app, shell, safeStorage }) {
  const authPath = () => path.join(app.getPath("userData"), "google-drive-auth.json");
  const configPath = () => path.join(app.getPath("userData"), "google-drive-connector.json");

  async function clientCredentials() {
    if (embeddedClientId && embeddedClientSecret) return { clientId: embeddedClientId, clientSecret: embeddedClientSecret };
    try {
      const stored = JSON.parse(await fs.readFile(configPath(), "utf8"));
      return {
        clientId: stored.clientId || "",
        clientSecret: stored.encryptedClientSecret ? decodeToken(stored.encryptedClientSecret) : "",
      };
    } catch { return { clientId: "", clientSecret: "" }; }
  }

  async function configure(value) {
    const normalized=String(value?.clientId||"").trim();
    const clientSecret=String(value?.clientSecret||"").trim();
    if(!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(normalized)) throw new Error("Enter a valid Google OAuth Desktop Client ID ending in .apps.googleusercontent.com.");
    if(clientSecret.length<8) throw new Error("Enter the Client Secret issued with the Google OAuth Desktop credential.");
    await fs.mkdir(path.dirname(configPath()),{recursive:true});
    await fs.writeFile(configPath(),JSON.stringify({clientId:normalized,encryptedClientSecret:encodeToken(clientSecret),configuredAt:new Date().toISOString()}),{encoding:"utf8",mode:0o600});
    await fs.rm(authPath(),{force:true});
    return status();
  }

  async function readAuth() {
    try { return JSON.parse(await fs.readFile(authPath(), "utf8")); } catch { return null; }
  }

  async function writeAuth(value) {
    await fs.mkdir(path.dirname(authPath()), { recursive: true });
    await fs.writeFile(authPath(), JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  }

  async function status() {
    const auth = await readAuth();
    const credentials = await clientCredentials();
    return { configured: Boolean(credentials.clientId && credentials.clientSecret), managed: Boolean(embeddedClientId && embeddedClientSecret), connected: Boolean(auth?.refreshToken && auth?.grantedScopes?.includes(DRIVE_SCOPE)), email: auth?.email || "", lastBackupAt: auth?.lastBackupAt || "", lastFileName: auth?.lastFileName || "" };
  }

  function encodeToken(token) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure Windows credential storage is unavailable.");
    return safeStorage.encryptString(token).toString("base64");
  }

  function decodeToken(value) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure Windows credential storage is unavailable.");
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  }

  async function accessToken() {
    const { clientId: activeClientId, clientSecret: activeClientSecret }=await clientCredentials();
    if(!activeClientId||!activeClientSecret) throw new Error("Configure the Google OAuth Desktop Client ID and Client Secret first.");
    const auth = await readAuth();
    if (!auth?.refreshToken) throw new Error("Google Drive is not connected.");
    if(!auth.grantedScopes?.includes(DRIVE_SCOPE)) throw new Error("Google Drive backup permission is missing. Disconnect and reconnect, then allow the requested Drive permission.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: activeClientId, client_secret: activeClientSecret, refresh_token: decodeToken(auth.refreshToken), grant_type: "refresh_token" }),
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google session could not be refreshed.");
    if(result.scope&&!String(result.scope).split(" ").includes(DRIVE_SCOPE)) throw new Error("Google Drive backup permission is no longer available. Reconnect the Google account and allow Drive backup access.");
    return result.access_token;
  }

  async function connect(preferredEmail = "") {
    const { clientId: activeClientId, clientSecret: activeClientSecret }=await clientCredentials();
    if (!activeClientId||!activeClientSecret) throw new Error("Configure the Google OAuth Desktop Client ID and Client Secret first.");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = crypto.randomBytes(24).toString("hex");
    let resolveCode;
    let rejectCode;
    const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    const server = http.createServer((request, response) => {
      try {
        const url = new URL(request.url, "http://127.0.0.1");
        if (url.pathname !== "/oauth2callback") { response.writeHead(404).end(); return; }
        if (url.searchParams.get("state") !== state) throw new Error("Google sign-in state validation failed.");
        const error = url.searchParams.get("error");
        if (error) throw new Error(error === "access_denied" ? "Google Drive access was cancelled." : error);
        const code = url.searchParams.get("code");
        if (!code) throw new Error("Google did not return an authorization code.");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<main style='font-family:Segoe UI;padding:40px'><h1>Google authorisation received</h1><p>Return to Bright Nexa while the secure connection is finalised. The app will confirm when Google Drive is connected.</p></main>");
        resolveCode(code);
      } catch (error) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }); response.end(error.message); rejectCode(error);
      }
    });
    await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
    const port = server.address().port;
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.search = new URLSearchParams({ client_id: activeClientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256", ...(preferredEmail ? { login_hint: preferredEmail } : {}) }).toString();
    await shell.openExternal(authorization.toString());
    const timeout = setTimeout(() => rejectCode(new Error("Google sign-in timed out. Please try again.")), 180000);
    try {
      const code = await codePromise;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: activeClientId, client_secret: activeClientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.refresh_token) throw new Error(tokens.error_description || "Google did not provide a renewable connection.");
      const grantedScopes=String(tokens.scope||"").split(" ").filter(Boolean);
      if(!grantedScopes.includes(DRIVE_SCOPE)) throw new Error("Google sign-in completed, but Drive backup permission was not granted. Reconnect and allow the app-data permission.");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
      const profile = profileResponse.ok ? await profileResponse.json() : {};
      const previous = await readAuth();
      await writeAuth({ email: profile.email || preferredEmail, refreshToken: encodeToken(tokens.refresh_token), grantedScopes, lastBackupAt: previous?.lastBackupAt || "", lastFileName: previous?.lastFileName || "" });
      return status();
    } finally { clearTimeout(timeout); server.close(); }
  }

  async function listBackups(token) {
    const query = encodeURIComponent(`appProperties has { key='product' and value='${PRODUCT_KEY}' }`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime%20desc&fields=files(id,name,size,modifiedTime,md5Checksum)&pageSize=100`, { headers: { authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Google Drive backup list could not be read.");
    return result.files || [];
  }

  async function uploadBackup({ fileName, bytes }) {
    const token = await accessToken();
    const content = Buffer.from(bytes);
    const boundary = `bharat_ai_${crypto.randomBytes(12).toString("hex")}`;
    const metadata = JSON.stringify({ name: fileName, parents: ["appDataFolder"], appProperties: { product: PRODUCT_KEY } });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content, Buffer.from(`\r\n--${boundary}--`),
    ]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime,md5Checksum", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` }, body });
    const created = await response.json();
    if (!response.ok) throw new Error(created.error?.message || "Backup could not be uploaded to Google Drive.");
    const localMd5 = crypto.createHash("md5").update(content).digest("hex");
    if (Number(created.size) !== content.length || (created.md5Checksum && created.md5Checksum !== localMd5)) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${created.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      throw new Error("Uploaded backup verification failed; the previous backup was preserved.");
    }
    const backups = await listBackups(token);
    for (const backup of backups) if (backup.id !== created.id) {
      const deletion = await fetch(`https://www.googleapis.com/drive/v3/files/${backup.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      if (!deletion.ok && deletion.status !== 404) throw new Error("New backup is safe, but an older Drive backup could not be removed.");
    }
    const auth = await readAuth();
    await writeAuth({ ...auth, lastBackupAt: new Date().toISOString(), lastFileName: created.name });
    return { ...created, deletedPrevious: Math.max(0, backups.length - 1) };
  }

  async function downloadLatest() {
    const token = await accessToken();
    const [latest] = await listBackups(token);
    if (!latest) throw new Error("No Bright Nexa backup was found in this Google Drive account.");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("The latest Google Drive backup could not be downloaded.");
    return { fileName: latest.name, bytes: new Uint8Array(await response.arrayBuffer()), modifiedTime: latest.modifiedTime };
  }

  ipcMain.handle("google-drive:status", status);
  ipcMain.handle("google-drive:configure", (_event, value) => configure(value));
  ipcMain.handle("google-drive:connect", (_event, preferredEmail) => connect(preferredEmail));
  ipcMain.handle("google-drive:disconnect", async () => { await fs.rm(authPath(), { force: true }); return status(); });
  ipcMain.handle("google-drive:upload-backup", (_event, payload) => uploadBackup(payload));
  ipcMain.handle("google-drive:download-latest", downloadLatest);
}

module.exports = { registerGoogleDriveHandlers };
