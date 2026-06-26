import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function pngHasAlpha(relativePath) {
  const file = fs.readFileSync(path.join(root, relativePath));
  const pngSignature = "89504e470d0a1a0a";
  if (file.subarray(0, 8).toString("hex") !== pngSignature) return false;
  const colorType = file[25];
  return colorType === 4 || colorType === 6;
}

const assets = readJson("data/assets.json");
const settings = readJson("data/settings.json");
const replies = readJson("data/replies.json");
const replyRules = readJson("data/reply-rules.json");
const reminders = readJson("data/reminder-messages.json");
const idleBubbles = readJson("data/idle-bubbles.json");

const errors = [];
const warnings = [];

const costumeIds = new Set();
for (const costume of assets.costumes ?? []) {
  if (!costume.id) errors.push("Costume missing id.");
  if (costumeIds.has(costume.id)) errors.push(`Duplicate costume id: ${costume.id}`);
  costumeIds.add(costume.id);
}

const moodIds = new Set();
const bubbleIds = new Set((assets.bubbles ?? []).map((bubble) => bubble.id));
for (const mood of assets.moods ?? []) {
  if (!mood.id) errors.push("Mood missing id.");
  if (moodIds.has(mood.id)) errors.push(`Duplicate mood id: ${mood.id}`);
  if (!bubbleIds.has(mood.bubble)) errors.push(`Mood ${mood.id} references missing bubble ${mood.bubble}.`);
  moodIds.add(mood.id);
}

for (const bubble of assets.bubbles ?? []) {
  if (!bubble.file || !exists(bubble.file)) errors.push(`Bubble asset missing: ${bubble.id} -> ${bubble.file}`);
  if (bubble.file?.endsWith(".png") && exists(bubble.file) && !pngHasAlpha(bubble.file)) {
    warnings.push(`Bubble PNG may lack alpha channel: ${bubble.file}`);
  }
}

for (const pack of assets.costumePacks ?? []) {
  for (const costumeId of pack.costumeIds ?? []) {
    if (!costumeIds.has(costumeId)) errors.push(`Costume pack ${pack.id} references missing costume ${costumeId}.`);
  }
}

const enabledCostumes = (assets.costumes ?? []).filter((costume) => costume.enabled);
const expectedAvatarSlots = enabledCostumes.length * (assets.moods ?? []).length;
let existingAvatarSlots = 0;
const missingAvatarSlots = [];
const avatarWithoutAlpha = [];

for (const costume of enabledCostumes) {
  for (const mood of assets.moods ?? []) {
    const key = `${costume.id}_${mood.id}`;
    const candidates = [
      assets.avatarOverrides?.[key],
      assets.generatedAvatarPathPattern?.replace("{costume}", costume.id).replace("{mood}", mood.id),
      assets.avatarPathPattern?.replace("{costume}", costume.id).replace("{mood}", mood.id)
    ].filter(Boolean);
    const found = candidates.find((candidate) => exists(candidate));
    if (!found) {
      missingAvatarSlots.push(key);
      continue;
    }
    existingAvatarSlots += 1;
    if (found.endsWith(".png") && !pngHasAlpha(found)) avatarWithoutAlpha.push(found);
  }
}

for (const rule of replyRules ?? []) {
  if (!moodIds.has(rule.mood)) errors.push(`Reply rule ${rule.id} references missing mood ${rule.mood}.`);
  if (!Array.isArray(replies[rule.id]) || replies[rule.id].length === 0) {
    errors.push(`Reply rule ${rule.id} has no reply pool.`);
  }
}

for (const [id, reminder] of Object.entries(reminders ?? {})) {
  if (!moodIds.has(reminder.mood)) errors.push(`Reminder ${id} references missing mood ${reminder.mood}.`);
}

for (const bubble of idleBubbles ?? []) {
  if (!moodIds.has(bubble.mood)) errors.push(`Idle bubble ${bubble.id} references missing mood ${bubble.mood}.`);
}

if (!costumeIds.has(settings.selectedCostume)) errors.push(`Settings selectedCostume missing: ${settings.selectedCostume}`);
if (!moodIds.has(settings.selectedMood)) errors.push(`Settings selectedMood missing: ${settings.selectedMood}`);
if (!bubbleIds.has(settings.selectedBubble)) errors.push(`Settings selectedBubble missing: ${settings.selectedBubble}`);

if (missingAvatarSlots.length > 0) {
  warnings.push(`Missing avatar slots (${missingAvatarSlots.length}/${expectedAvatarSlots}): ${missingAvatarSlots.slice(0, 20).join(", ")}${missingAvatarSlots.length > 20 ? "..." : ""}`);
}
if (avatarWithoutAlpha.length > 0) {
  warnings.push(`Avatar PNG may lack alpha channel (${avatarWithoutAlpha.length}): ${avatarWithoutAlpha.slice(0, 10).join(", ")}${avatarWithoutAlpha.length > 10 ? "..." : ""}`);
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`Error: ${error}`);
  process.exit(1);
}

console.log(`Asset check passed: ${existingAvatarSlots}/${expectedAvatarSlots} avatar slots available.`);
