import express from "express";
import cors from "cors";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addUser,
  addGameScore,
  getGlobalTopScores,
  getScoreRank,
  getUserTopScores,
  createUser,
  deleteUser,
  verifyUserCredentials,
} from "./db.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, ".env"));

// -- Install middleware --
// CORS middleware
app.use(cors());
// JSON body parser
app.use(express.json());
// URL-encoded body parser (for Form Data)
app.use(express.urlencoded({ extended: true }));
// Serve the static frontend (one origin for app + API)
app.use(express.static(path.join(__dirname, "../frontend")));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

import { stanfordLocations } from "../worker/locations.mjs";

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "StanGuessr API is running" });
});

app.get("/api/location/random", (req, res) => {
  const excludedIds = new Set(
    String(req.query.exclude || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id)),
  );
  const availableLocations = stanfordLocations.filter(
    (location) => !excludedIds.has(location.id),
  );

  if (availableLocations.length === 0) {
    return res.status(409).json({ error: "No unused locations available" });
  }

  const randomIndex = Math.floor(Math.random() * availableLocations.length);
  const location = availableLocations[randomIndex];
  res.json(location);
});

app.get("/api/config/maps", (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "GOOGLE_MAPS_API_KEY is not configured" });
    return;
  }

  res.json({ apiKey });
});

// ==========================================
// DB CALLS
// ==========================================

// Retrieving global stats
app.get("/api/leaderboard/:limit", (req, res) => {
  const limit = Number(req.params.limit);
  const leaders = getGlobalTopScores(limit);

  if (!leaders) {
    return res.status(404).json({ error: `Limit with ${limit} caused error` });
  }

  res.json(leaders);
});

app.get("/api/leaderboard/rank/:score", (req, res) => {
  const score = Number(req.params.score);

  if (!Number.isFinite(score)) {
    return res.status(400).json({ error: "Score must be a number" });
  }

  res.json({ rank: getScoreRank(score) });
});

// Retrieving personal stats
app.get("/api/users/:userid/scores/:limit", (req, res) => {
  const userid = Number(req.params.userid);
  const limit = Number(req.params.limit);
  const topScores = getUserTopScores(userid, limit);

  if (!topScores) {
    return res
      .status(404)
      .json({ error: `User with id ${userid} and limit ${limit} not found` });
  }

  res.json(topScores);
});

// Adding game data
app.post("/api/end-game", (req, res) => {
  const { score, userid } = req.body;

  if (score === undefined || userid === undefined) {
    return res
      .status(400)
      .json({ error: "Missing required fields: score, userid" });
  }

  const newGame = addGameScore(score, userid);
  res.status(201).json(newGame);
});

// Adding new user
app.post("/api/users", (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing required fields: name" });
  }

  const newUser = addUser(name);
  res.status(201).json(newUser);
});

// Creating a user's account
app.post("/api/signup", (req, res) => {
  const name = req.body.name?.trim();

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const newUser = createUser(name);

  if (!newUser) {
    return res.status(409).json({ error: "Name already taken" });
  }

  res.status(201).json(newUser);
});

// Logging into a user's account
app.post("/api/login", (req, res) => {
  const name = req.body.name?.trim();

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const user = verifyUserCredentials(name);

  if (!user) {
    return res.status(401).json({ error: "Username not found" });
  }

  res.json(user);
});

app.listen(PORT, () => {
  console.log(`StanGuessr backend running on http://localhost:${PORT}`);
});
