// ============================================================
//  auth.js — Discord OAuth2 for Hazelink Dashboard
//  Protects /Bot routes to server admins only
// ============================================================

const crypto = require("crypto");

// ── Config (set these in env vars) ───────────────────────────
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     ?? "YOUR_CLIENT_ID";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "YOUR_CLIENT_SECRET";
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI  ??
  "https://hazelink.app/Bot/auth/callback";
const SESSION_SECRET        = process.env.SESSION_SECRET        ?? crypto.randomBytes(32).toString("hex");

// In-memory session store (replace with Redis/mongo for prod)
const sessions = new Map();

// ── Discord OAuth2 endpoints ──────────────────────────────────
const DISCORD_API   = "https://discord.com/api/v10";
const OAUTH_BASE    = "https://discord.com/oauth2/authorize";
const TOKEN_URL     = `${DISCORD_API}/oauth2/token`;
const SCOPES        = "identify guilds";

// ── Build the authorization URL ───────────────────────────────
function getOAuthURL(state) {
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    state,
    prompt:        "none",
  });
  return `${OAUTH_BASE}?${params}`;
}

// ── Exchange code for access token ────────────────────────────
async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type:    "authorization_code",
    code,
    redirect_uri:  DISCORD_REDIRECT_URI,
  });

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

// ── Fetch Discord user info ────────────────────────────────────
async function fetchUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

// ── Fetch user's guilds ────────────────────────────────────────
async function fetchGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch guilds");
  return res.json();
}

// ── Check if user is admin of any mutual guild ────────────────
//   Permissions flag 0x8 = ADMINISTRATOR
function isAdminOfAnyMutualGuild(userGuilds, botClient) {
  for (const g of userGuilds) {
    const botGuild = botClient?.guilds?.cache?.get(g.id);
    if (!botGuild) continue;
    if ((BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) return true;
  }
  return false;
}

// ── Session helpers ────────────────────────────────────────────
function createSession(userData) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    user:      userData,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}

function deleteSession(token) {
  sessions.delete(token);
}

// Prune expired sessions every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now > v.expiresAt) sessions.delete(k);
  }
}, 30 * 60 * 1000);

// ── Express middleware ─────────────────────────────────────────

/** Parse session cookie and attach user to req */
function sessionMiddleware(req, res, next) {
  const token = req.cookies?.hazel_session;
  const s     = getSession(token);
  req.user    = s?.user ?? null;
  req.sessionToken = token ?? null;
  next();
}

/** Require logged-in user. Redirects to /Bot/login if not. */
function requireAuth(req, res, next) {
  if (!req.user) return res.redirect("/Bot/login");
  next();
}

/** Require server admin. Returns 403 if not admin. */
function requireAdmin(botClient) {
  return async (req, res, next) => {
    if (!req.user) return res.redirect("/Bot/login");
    try {
      const guilds  = await fetchGuilds(req.user.accessToken);
      const isAdmin = isAdminOfAnyMutualGuild(guilds, botClient);
      if (!isAdmin) return res.status(403).send("403 — You are not an admin of any Hazel-managed server.");
      req.userGuilds = guilds;
      next();
    } catch (err) {
      console.error("[Auth] requireAdmin error:", err.message);
      res.redirect("/Bot/login");
    }
  };
}

// ── Auth routes factory ────────────────────────────────────────
/** Call attachAuthRoutes(app, botClient) inside dashboard.js */
function attachAuthRoutes(app, botClient) {
  const cookieParser = require("cookie-parser");
  app.use(cookieParser());

  // LOGIN PAGE
  app.get("/Bot/login", (req, res) => {
    if (req.user) return res.redirect("/Bot");
    const state = crypto.randomBytes(16).toString("hex");
    res
      .cookie("oauth_state", state, { httpOnly: true, maxAge: 5 * 60 * 1000, sameSite: "lax" })
      .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Hazelink Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:#0a0a12;font-family:'Segoe UI',sans-serif;color:#e0e0f0}
    .card{background:#12121e;border:1px solid #2a2a3a;border-radius:16px;
          padding:3rem 2.5rem;text-align:center;max-width:360px;width:100%}
    h1{font-size:1.8rem;color:#fff;margin-bottom:.5rem}
    p{color:#7878a0;font-size:.95rem;margin-bottom:2rem}
    a{display:inline-block;background:#5865F2;color:#fff;text-decoration:none;
      padding:.85rem 2.5rem;border-radius:10px;font-weight:600;font-size:1rem;
      transition:background .2s}
    a:hover{background:#4752c4}
    .logo{font-size:2.5rem;margin-bottom:1rem}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡</div>
    <h1>Hazelink</h1>
    <p>Sign in with Discord to access the Hazel dashboard. Server admin required.</p>
    <a href="${getOAuthURL(state)}">Login with Discord</a>
  </div>
</body>
</html>`);
  });

  // OAUTH CALLBACK
  app.get("/Bot/auth/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) return res.redirect("/Bot/login?error=denied");

    const storedState = req.cookies?.oauth_state;
    if (!state || state !== storedState) {
      return res.status(400).send("Invalid OAuth state. Please try again.");
    }

    try {
      const tokens  = await exchangeCode(code);
      const user    = await fetchUser(tokens.access_token);

      const sessionUser = {
        id:           user.id,
        username:     user.username,
        discriminator:user.discriminator,
        tag:          `${user.username}#${user.discriminator}`,
        avatar:       user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`,
        accessToken:  tokens.access_token,
      };

      const token = createSession(sessionUser);

      res
        .clearCookie("oauth_state")
        .cookie("hazel_session", token, {
          httpOnly: true,
          maxAge:   24 * 60 * 60 * 1000,
          sameSite: "lax",
          secure:   process.env.NODE_ENV === "production",
        })
        .redirect("/Bot");
    } catch (err) {
      console.error("[Auth] Callback error:", err.message);
      res.redirect("/Bot/login?error=auth_failed");
    }
  });

  // LOGOUT
  app.get("/Bot/logout", (req, res) => {
    deleteSession(req.cookies?.hazel_session);
    res.clearCookie("hazel_session").redirect("/Bot/login");
  });

  // Attach session middleware globally
  app.use(sessionMiddleware);
}

module.exports = {
  attachAuthRoutes,
  requireAuth,
  requireAdmin,
  sessionMiddleware,
  SESSION_SECRET,
};
