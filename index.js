// ============================================================
//  index.js — Hazel Bot Entry Point (updated)
//  Integrates: logging · moderation · dashboard
// ============================================================

require("dotenv").config(); // loads .env locally; SkyBots uses env vars directly

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
} = require("discord.js");
const fs      = require("fs");
const path    = require("path");
const mongoose = require("mongoose");

const config  = require("./config/config.json");
const logger  = require("./utils/logger");

// ── NEW MODULES ───────────────────────────────────────────────
const { initLogging }       = require("./logging");
const { initModeration, routeCommand } = require("./moderation");
const { startDashboard }    = require("./dashboard");

// ── Client ────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,    // for ban/kick audit logs
  ],
});

client.config        = config;
client.commands      = new Collection(); // slash commands
client.prefixCommands= new Collection(); // prefix commands
client.cooldowns     = new Collection();

// ── Slash command loader ──────────────────────────────────────
const slashData = [];

function loadCommands(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { loadCommands(full); continue; }
    if (!entry.name.endsWith(".js")) continue;
    try {
      const cmd = require(full);
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
        slashData.push(cmd.data.toJSON());
        logger.info(`[CMD] Slash: ${cmd.data.name}`);
      }
      if (cmd.name && cmd.run) {
        client.prefixCommands.set(cmd.name, cmd);
        (cmd.aliases ?? []).forEach(a => client.prefixCommands.set(a, cmd));
        logger.info(`[CMD] Prefix: ${cmd.name}`);
      }
    } catch (err) {
      logger.error(`[CMD] Load failed ${full}: ${err.message}`);
    }
  }
}

// ── Event file loader ─────────────────────────────────────────
function loadEvents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
    try {
      const event    = require(path.join(dir, file));
      const evtName  = file.replace(".js", "");
      event.once
        ? client.once(evtName,  (...a) => event.execute(...a, client))
        : client.on  (evtName,  (...a) => event.execute(...a, client));
      logger.info(`[EVT] ${evtName}`);
    } catch (err) {
      logger.error(`[EVT] Load failed ${file}: ${err.message}`);
    }
  }
}

// ── Load commands & file-based events ────────────────────────
loadCommands("./commands");
loadEvents("./events");

// ── Slash command interaction handler ─────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return interaction.reply({ content: "❌ Unknown command.", ephemeral: true });

  // Cooldown
  if (!client.cooldowns.has(command.data.name))
    client.cooldowns.set(command.data.name, new Collection());
  const now        = Date.now();
  const timestamps = client.cooldowns.get(command.data.name);
  const cdMs       = (command.cooldown ?? 3) * 1000;
  if (timestamps.has(interaction.user.id)) {
    const expires = timestamps.get(interaction.user.id) + cdMs;
    if (now < expires)
      return interaction.reply({ content: `⏳ Wait **${((expires - now) / 1000).toFixed(1)}s**.`, ephemeral: true });
  }
  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cdMs);

  try {
    await command.execute(interaction, client);
  } catch (err) {
    logger.error(`[CMD] ${interaction.commandName}: ${err.message}`);
    const payload = { content: "❌ Command error.", ephemeral: true };
    interaction.replied || interaction.deferred
      ? interaction.followUp(payload)
      : interaction.reply(payload);
  }
});

// ── messageCreate — prefix commands + moderation router ───────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = client.config.prefix ?? "!";
  if (!message.content.startsWith(prefix)) return;

  const args    = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = args.shift().toLowerCase();

  // ── Try moderation commands first ─────────────────────────
  const handledByMod = await routeCommand(message, cmdName, args);
  if (handledByMod) return;

  // ── Then try file-based prefix commands ───────────────────
  const command = client.prefixCommands.get(cmdName);
  if (!command) return;

  try {
    await command.run(message, args, client);
  } catch (err) {
    logger.error(`[PREFIX] ${cmdName}: ${err.message}`);
    message.reply("❌ Command error.").catch(() => null);
  }
});

// ── Ready ─────────────────────────────────────────────────────
client.once("ready", async () => {
  logger.success(`✅ Hazel is online! Logged in as ${client.user.tag}`);

  // Register slash commands globally
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashData });
    logger.success(`[API] Registered ${slashData.length} slash command(s).`);
  } catch (err) {
    logger.error(`[API] Slash registration failed: ${err.message}`);
  }

  // Set presence
  client.user.setPresence({
    activities: [{ name: "Hazelink Community", type: 3 }],
    status: "online",
  });

  // ── START DASHBOARD ──────────────────────────────────────
  // Runs Express at /Bot — accessible at https://hazelink.app/Bot
  startDashboard(client);
});

// ── MongoDB ───────────────────────────────────────────────────
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => logger.success("[DB] MongoDB connected."))
    .catch(err => logger.error(`[DB] ${err.message}`));
} else {
  logger.warn("[DB] MONGO_URI not set — moderation history will not persist.");
}

// ── INIT LOGGING MODULE ───────────────────────────────────────
//   Attaches join/leave/delete/edit/role-change listeners
initLogging(client);

// ── INIT MODERATION MODULE ────────────────────────────────────
//   Registers prefix command router (!ban !kick !mute !warn …)
initModeration(client);

// ── Login ─────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error("DISCORD_TOKEN is not set. Exiting.");
  process.exit(1);
}

client.login(token);
module.exports = client;
