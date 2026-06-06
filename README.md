# StanGuessr

A Stanford location guessing game inspired by [GeoGuessr](https://www.geoguessr.com/)

Made by Carter, Eric, Tina, and Andrea for CS146J

## Running locally

1. Go to [Google Maps Platform | Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/demo-key) and click "Get a Demo Key".\*
2. Create a `.env` file in the `backend` folder and add the line `GOOGLE_MAPS_API_KEY=[YOUR_MAPS_DEMO_KEY]`.
3. Open your terminal, navigate to the `backend` folder, and run `npm install` then `npm start`.
4. Open [http://localhost:3001/](http://localhost:3001/) in your browser. The Express server now serves the frontend, so you no longer open `index.html` directly.

\*Note: You may need to link a billing account to the project in Google Cloud to remove watermarks and negative imaging. This should not charge you though.

## Deploying to the web (Railway)

The app deploys as a single Railway service: the Express backend serves both the API
and the static frontend, and a Railway **Volume** holds the SQLite database so scores
and accounts persist across deploys.

### One-time setup

1. **Production Maps key.** In the Google Cloud Console, enable the **Maps JavaScript
   API** and **Street View Static API**, create an API key, and under "Application
   restrictions" choose **HTTP referrers**. Add your Railway domain (start with
   `https://*.up.railway.app/*`, then tighten to the exact domain after step 6). Set
   quota caps to stay within Google's free monthly usage.
2. **Create the project.** On [railway.app](https://railway.app), sign in with GitHub →
   **New Project** → **Deploy from GitHub repo** → select this repo. Railway builds
   from the root `package.json`.
3. **Variables** (service → Variables tab):
   - `GOOGLE_MAPS_API_KEY` = the key from step 1
   - `DB_PATH` = `/data/guesser.db`

   Do **not** set `PORT` — Railway provides it automatically.
4. **Volume** (service → add a Volume): mount path `/data`. This is where the SQLite
   file lives and persists between deploys.
5. **Generate a domain** (Settings → Networking → Generate Domain) to get a public URL
   like `stanguessr-production.up.railway.app`.
6. Tighten the Maps key's HTTP-referrer restriction to that exact domain.

### Updating the live site

Push to `main` (or merge a PR) and Railway redeploys automatically. No CLI needed.
