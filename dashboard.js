// ============================================================
//  dashboard.js — Hazelink Bot Dashboard
//  Served at /Bot  →  https://hazelink.app/Bot
//  Discord OAuth2 protected, MongoDB powered
// ============================================================

const express    = require("express");
const path       = require("path");
const mongoose   = require("mongoose");

const { attachAuthRoutes, requireAuth } = require("./auth");
const { ModerationAction }              = require("./moderation");

const app    = express();
const PORT   = process.env.PORT ?? 3000;
const PUBLIC = path.join(__dirname, "public");

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files served at /Bot/static
app.use("/Bot/static", express.static(PUBLIC));

// ── Helpers ───────────────────────────────────────────────────
function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    pages:   Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

// ── Start the dashboard ───────────────────────────────────────
function startDashboard(client) {

  // Attach OAuth2 login/callback/logout + cookie-parser + sessionMiddleware
  attachAuthRoutes(app, client);

  // ── Redirects ─────────────────────────────────────────────
  app.get("/",    (req, res) => res.redirect("/Bot"));
  app.get("/Bot", requireAuth, (req, res) =>
    res.sendFile(path.join(PUBLIC, "index.html"))
  );

  // ── API — me ──────────────────────────────────────────────
  app.get("/Bot/api/me", requireAuth, (req, res) => {
    const { id, tag, username, avatar } = req.user;
    res.json({ id, tag, username, avatar });
  });

  // ── API — bot stats ────────────────────────────────────────
  app.get("/Bot/api/stats", requireAuth, async (req, res) => {
    try {
      const [total, bans, kicks, mutes, warns] = await Promise.all([
        ModerationAction.countDocuments(),
        ModerationAction.countDocuments({ action: "ban" }),
        ModerationAction.countDocuments({ action: "kick" }),
        ModerationAction.countDocuments({ action: "mute" }),
        ModerationAction.countDocuments({ action: "warn" }),
      ]);

      res.json({
        bot: {
          name:    "Hazel",
          project: "hazelink-bot",
          guilds:  client.guilds?.cache?.size ?? 0,
          users:   client.users?.cache?.size  ?? 0,
          ping:    client.ws?.ping            ?? 0,
          uptime:  client.uptime              ?? 0,
          status:  client.isReady() ? "online" : "offline",
        },
        moderation: { total, bans, kicks, mutes, warns },
        db: { connected: mongoose.connection.readyState === 1 },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── API — moderation logs ─────────────────────────────────
  app.get("/Bot/api/modlogs", requireAuth, async (req, res) => {
    try {
      const page    = Math.max(1,   parseInt(req.query.page  ?? "1"));
      const limit   = Math.min(100, parseInt(req.query.limit ?? "25"));
      const skip    = (page - 1) * limit;
      const filter  = {};

      if (req.query.action)  filter.action  = req.query.action;
      if (req.query.guildId) filter.guildId = req.query.guildId;
      if (req.query.userId)  filter.$or = [
        { targetId:    req.query.userId },
        { moderatorId: req.query.userId },
      ];

      const [records, total] = await Promise.all([
        ModerationAction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        ModerationAction.countDocuments(filter),
      ]);

      res.json({ records, pagination: paginationMeta(total, page, limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── API — single case ─────────────────────────────────────
  app.get("/Bot/api/modlogs/:id", requireAuth, async (req, res) => {
    try {
      const r = await ModerationAction.findById(req.params.id);
      if (!r) return res.status(404).json({ error: "Case not found" });
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── API — delete case (owner only) ────────────────────────
  app.delete("/Bot/api/modlogs/:id", requireAuth, async (req, res) => {
    if (req.user.id !== process.env.OWNER_ID)
      return res.status(403).json({ error: "Owner only." });
    try {
      await ModerationAction.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── API — server events feed ──────────────────────────────
  app.get("/Bot/api/events", requireAuth, async (req, res) => {
    try {
      const page  = Math.max(1,   parseInt(req.query.page  ?? "1"));
      const limit = Math.min(100, parseInt(req.query.limit ?? "25"));
      const skip  = (page - 1) * limit;

      const [records, total] = await Promise.all([
        ModerationAction.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
        ModerationAction.countDocuments(),
      ]);

      res.json({
        events: records.map((r) => ({
          id:          r._id,
          caseNumber:  r.caseNumber,
          type:        r.action,
          guildId:     r.guildId,
          guildName:   r.guildName,
          targetId:    r.targetId,
          targetTag:   r.targetTag,
          moderatorId: r.moderatorId,
          moderatorTag:r.moderatorTag,
          reason:      r.reason,
          duration:    r.duration,
          createdAt:   r.createdAt,
        })),
        pagination: paginationMeta(total, page, limit),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── API — guilds ──────────────────────────────────────────
  app.get("/Bot/api/guilds", requireAuth, (req, res) => {
    const guilds = client.guilds?.cache?.map((g) => ({
      id:   g.id,
      name: g.name,
      icon: g.iconURL({ size: 64 }),
      memberCount: g.memberCount,
    })) ?? [];
    res.json(guilds);
  });

  // ── 404 ───────────────────────────────────────────────────
  app.use("/Bot", (req, res) => res.status(404).json({ error: "Not found" }));

  // ── Listen ────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`[Dashboard] Running → http://localhost:${PORT}/Bot`);
    console.log(`[Dashboard] Production → https://hazelink.app/Bot`);
  });
}

module.exports = { startDashboard, app };
