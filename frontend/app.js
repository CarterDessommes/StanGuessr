const BASE_API_URL = "/api";

const homeScreen = document.querySelector("main");
const endScreen = document.querySelector("#end-screen");
const end_lead_list = document.querySelector("#end-leaderboard-list");
const loadingScreen = document.getElementById("loading-screen");
const gameView = document.getElementById("game-view");
const resultsView = document.getElementById("results-view");
const guessMapPanel = document.getElementById("guess-map-panel");
const guessButton = document.getElementById("guess-button");
const summaryMapElement = document.getElementById("summary-map");
const resultsNextButton = document.getElementById("results-next-btn");
const authView = document.getElementById("auth-view");
const authForm = document.getElementById("auth-form");
const authNameInput = document.getElementById("auth-name");
const authPasswordInput = document.getElementById("auth-password");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authFeedback = document.getElementById("auth-feedback");
const authSubmit = document.getElementById("auth-submit");
const authSwitchText = document.getElementById("auth-switch-text");
const authSwitchButton = document.getElementById("auth-switch-button");

const tracker = document.getElementById("round-tracker");

const STANFORD_CENTER = { lat: 37.4275, lng: -122.1697 };
const MAX_POINTS = 5000;
const DECAY_CONSTANT = 300;
const TEARDROP =
  "M 0,2 C -1,1 -1.2,0 -1.2,-0.3 C -1.2,-1.1 -0.6,-1.6 0,-1.6 C 0.6,-1.6 1.2,-1.1 1.2,-0.3 C 1.2,0 1,1 0,2 Z";

/* Game variables. */
let guessMap;
let guessMarker;
let currentLocation;
let googleMapsPromise;
let resultsMap;
let summaryMap;

/* User information. */
let userId = null;
let userName = "";
let authMode = "signup";
let authOrigin = "home";

/* Round tracking. */
const TOTAL_ROUNDS = 5;
let currentRound = 1;
let roundScores = [null, null, null, null, null]; // 5 rounds
let roundDistances = [null, null, null, null, null];
let roundResults = [];
let usedLocationIds = [];

/* Timer tracking. */
let timerInterval = null;
let timeRemaining = 60;

// ==========================================
// TIMER FUNCTIONS
// ==========================================

function startTimer() {
  timeRemaining = 60;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      onTimerExpire();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timeRemaining = 60;
}

function updateTimerDisplay() {
  const timerDisplay = document.getElementById("timer-display");
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  timerDisplay.setAttribute(
    "aria-label",
    `Time remaining ${minutes} minute${minutes === 1 ? "" : "s"} and ${seconds} second${seconds === 1 ? "" : "s"}`,
  );
}

function onTimerExpire() {
  stopTimer();

  if (guessMarker) {
    // User placed a pin - calculate their score
    const guessPosition = guessMarker.getPosition();
    const actualPosition = {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
    };

    const distance = calculateDistance(
      guessPosition.lat(),
      guessPosition.lng(),
      currentLocation.lat,
      currentLocation.lng,
    );
    const score = calculateScore(distance);

    showResults(guessPosition, actualPosition, score, distance);
  } else {
    // No pin placed - award 0 points
    const actualPosition = {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
    };

    showResults(null, actualPosition, 0, null);
  }
}

// ==========================================
// GAME FUNCTIONS
// ==========================================

function startGame() {
  resetGame();
  startRound();
}

function showGame() {
  loadingScreen.classList.add("hidden");
  gameView.classList.remove("hidden");
}

async function startRound() {
  showLoading();

  try {
    const excludeQuery = usedLocationIds.length
      ? `?exclude=${encodeURIComponent(usedLocationIds.join(","))}`
      : "";
    const response = await fetch(
      BASE_API_URL + "/location/random" + excludeQuery,
    );
    if (!response.ok) {
      throw new Error("No unused locations available.");
    }

    const location = await response.json();
    currentLocation = location;
    if (location.id !== undefined) {
      usedLocationIds.push(location.id);
    }

    showGame();
    showRoundTracker();
    updateRoundTracker();
    await loadGoogleMaps();
    initStreetView(location.lat, location.lng);
    initGuessMap();
    resetGuess();
    startTimer();
  } catch (error) {
    console.error("Failed to start round:", error);
    alert("Failed to load location. Please try again.");
    location.reload();
  }
}

function endGame() {
  const totalScore = roundScores.reduce((sum, score) => sum + (score || 0), 0);
  // Write score to db
  if (userId) {
    addGame(totalScore, userId);
  }

  document.querySelector("#final-score").textContent =
    totalScore.toLocaleString();
  updateSummaryRank(totalScore);

  hideResults();
  hideRoundTracker();
  endScreen.classList.remove("hidden");
  renderSummaryMap();
  pullGlobalStats(end_lead_list);
  pullPersonalStats(end_personal_list, end_signin_msg);
}

// End game leaderboard buttons
const drop_lead_btn = document.querySelector("#drop-lead-btn");
const hide_lead_btn = document.querySelector("#hide-lead-btn");
const lead_bar = document.querySelector("#lead-bar");
const end_leaderboard = document.querySelector("#end-leaderboard");
const end_personal_list = document.querySelector("#end-personal-list");
const end_signin_msg = document.querySelector("#end-signin-msg");

// Drop down leaderboard
drop_lead_btn.addEventListener("click", () => {
  const collapsed = end_leaderboard.classList.toggle("hidden");
  drop_lead_btn.textContent = collapsed ? "+" : "-";
});

// Hide end leaderboard
hide_lead_btn.addEventListener("click", () => {
  const rotated = lead_bar.classList.toggle("lead-bar-rotated");
  if (rotated) {
    hide_lead_btn.textContent = "▴";
    drop_lead_btn.classList.add("hidden");
    end_leaderboard.classList.add("hidden");
  } else {
    hide_lead_btn.textContent = "◂";
    drop_lead_btn.classList.remove("hidden");
    if (drop_lead_btn.textContent === "-") {
      end_leaderboard.classList.remove("hidden");
    }
  }
});

async function updateSummaryRank(totalScore) {
  const rankElement = document.querySelector("#summary-rank");
  rankElement.textContent = "...";

  try {
    const response = await fetch(
      BASE_API_URL + `/leaderboard/rank/${totalScore}`,
    );
    if (!response.ok) {
      throw new Error("Failed to load score rank.");
    }

    const data = await response.json();
    rankElement.textContent = `#${data.rank.toLocaleString()}`;
  } catch (error) {
    console.error("Failed to load score rank:", error);
    rankElement.textContent = "--";
  }
}

function showHome() {
  stopTimer();
  hideResults();
  hideRoundTracker();
  gameView.classList.add("hidden");
  loadingScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  authView.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  document.querySelector("header").classList.remove("hidden");
  document.querySelector("footer").classList.remove("hidden");
  document.getElementById("leaderboard").classList.remove("hidden");
  isAtTop = true;
  updateLeaderboardButtonText();
  pullGlobalStats(globalStats);
  pullPersonalStats();
}

document.querySelector("#summary-next-btn").addEventListener("click", () => {
  endScreen.classList.add("hidden");
  startGame();
});

document.querySelector("#summary-home-btn").addEventListener("click", showHome);

/* Add game to database. */
function addGame(finalScore, user) {
  fetch(BASE_API_URL + "/end-game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userid: user, score: finalScore }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Successfully added game:", data);
    })
    .catch((error) => console.log(error));
}

/* Add user to database. */
// function addUser(userName) {
//   let newUser = fetch(BASE_API_URL + "/users", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ name: userName }),
//   })
//     .then((response) => response.json())
//     .then((data) => {
//       user = data.userid;
//       userName = data.name;
//       console.log("Successfully added user:", data);
//     })
//     .catch((error) => console.log(error));
// }
async function signup(formData) {
  const response = await fetch(BASE_API_URL + "/signup", {
    method: "POST",
    body: new URLSearchParams(formData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error);
  }

  userId = data.userid;
  userName = data.name;
}

async function login(formData) {
  const response = await fetch(BASE_API_URL + "/login", {
    method: "POST",
    body: new URLSearchParams(formData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error);
  }

  userId = data.userid;
  userName = data.name;
}

function updateWelcomeMessage() {
  const welcomeMsg = document.getElementById("welcome-msg");
  const signupButton = document.getElementById("signup");
  const loginButton = document.getElementById("login");
  const logoutButton = document.getElementById("logout");

  if (userId && userName) {
    welcomeMsg.textContent = `Welcome, ${userName}!`;
    signMsg.classList.add("hidden");
    signupButton.classList.add("hidden");
    loginButton.classList.add("hidden");
    logoutButton.classList.remove("hidden");
  } else {
    welcomeMsg.textContent = "";
    signMsg.classList.remove("hidden");
    signupButton.classList.remove("hidden");
    loginButton.classList.remove("hidden");
    logoutButton.classList.add("hidden");
  }
}

function showLoading() {
  homeScreen.classList.add("hidden");
  document.querySelector("header").classList.add("hidden");
  document.querySelector("footer").classList.add("hidden");
  document.getElementById("leaderboard").classList.add("hidden");
  authView.classList.add("hidden");
  loadingScreen.classList.remove("hidden");
}

function setAuthFeedback(message, { success = false } = {}) {
  authFeedback.textContent = message;
  authFeedback.classList.toggle("success", success);
}

function updateAuthView() {
  const isSignup = authMode === "signup";

  authTitle.textContent = isSignup ? "Sign up" : "Log in";
  authSubtitle.textContent = isSignup
    ? "Create a StanGuessr username to save your best scores."
    : "Enter your StanGuessr username to load your personal leaderboard.";
  authSubmit.textContent = isSignup ? "Create account" : "Log in";
  authPasswordInput.autocomplete = isSignup
    ? "new-password"
    : "current-password";
  authSwitchText.textContent = isSignup
    ? "Already have an account?"
    : "Need an account?";
  authSwitchButton.textContent = isSignup ? "Log in" : "Sign up";
  authNameInput.value = "";
  authPasswordInput.value = "";
  setAuthFeedback("");
}

function showAuthView(mode, origin = "home") {
  authMode = mode;
  authOrigin = origin;
  homeScreen.classList.add("hidden");
  document.querySelector("header").classList.add("hidden");
  document.querySelector("footer").classList.add("hidden");
  document.getElementById("leaderboard").classList.add("hidden");
  loadingScreen.classList.add("hidden");
  gameView.classList.add("hidden");
  resultsView.classList.add("hidden");
  endScreen.classList.add("hidden");
  authView.classList.remove("hidden");
  updateAuthView();
  authNameInput.focus();
}

function returnFromAuth() {
  if (authOrigin === "end") {
    authView.classList.add("hidden");
    endScreen.classList.remove("hidden");
    return;
  }
  showHome();
}

function updateLeaderboardButtonText() {
  if (isAtTop) {
    leadboardBtn.textContent = "Leaderboard ↓";
    leadboardBtn.setAttribute("aria-label", "Jump to leaderboard");
    return;
  }

  leadboardBtn.textContent = "Leaderboard ↑";
  leadboardBtn.setAttribute("aria-label", "Return to top of page");
}

function updateGuessButtonState() {
  const isOpen = guessMapPanel.classList.contains("is-open");
  const hasPin = Boolean(guessMarker);

  guessButton.setAttribute("aria-expanded", String(isOpen));

  if (hasPin) {
    guessButton.textContent = "Guess";
    guessButton.setAttribute("aria-label", "Submit your guess");
    return;
  }

  guessButton.textContent = "Place pin on map";
  guessButton.setAttribute("aria-label", "Open the guess map to place a pin");
}

function updateResultsNextButton() {
  if (currentRound < TOTAL_ROUNDS) {
    resultsNextButton.setAttribute(
      "aria-label",
      `Go to round ${currentRound + 1} after reviewing this result`,
    );
    return;
  }

  resultsNextButton.setAttribute(
    "aria-label",
    "View the final game summary after reviewing this result",
  );
}

function resetGame() {
  stopTimer();
  currentRound = 1;
  roundScores = [null, null, null, null, null];
  roundDistances = [null, null, null, null, null];
  roundResults = [];
  usedLocationIds = [];
  currentLocation = null;
  endScreen.classList.add("hidden");
  updateRoundTracker();
}

// ==========================================
// IN GAME ROUND TRACKER
// ==========================================

function updateRoundTracker() {
  const roundItems = tracker.querySelectorAll(".round-item[data-round]");

  roundItems.forEach((item, index) => {
    const roundNum = index + 1;
    const scoreEl = item.querySelector(".round-score");

    // Remove all state classes
    item.classList.remove("current", "completed");

    if (roundScores[index] !== null) {
      // Round completed
      item.classList.add("completed");
      scoreEl.textContent = roundScores[index].toLocaleString();
    } else if (roundNum === currentRound) {
      // Current round
      item.classList.add("current");
      scoreEl.textContent = "-";
    } else {
      scoreEl.textContent = "-";
    }
  });

  // Update total
  const totalScore = roundScores.reduce((sum, score) => sum + (score || 0), 0);
  tracker.querySelector(".round-item.total .round-score").textContent =
    totalScore.toLocaleString();
}

function showRoundTracker() {
  document.getElementById("round-tracker").classList.remove("hidden");
}

function hideRoundTracker() {
  document.getElementById("round-tracker").classList.add("hidden");
}

// ==========================================
// GUESS RESULTS
// ==========================================

function createActualMarkerIcon() {
  const dpr = window.devicePixelRatio || 1;
  const s = 9;
  const w = Math.ceil(1.2 * s * 2);
  const h = Math.ceil(3.6 * s);

  const canvas = document.createElement("canvas");
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cx = w / 2;
  const base = h - 2 * s;

  function px(x, y) {
    return [cx + x * s, base + y * s];
  }

  ctx.beginPath();
  ctx.moveTo(...px(0, 2));
  ctx.bezierCurveTo(...px(-1, 1), ...px(-1.2, 0), ...px(-1.2, -0.3));
  ctx.bezierCurveTo(...px(-1.2, -1.1), ...px(-0.6, -1.6), ...px(0, -1.6));
  ctx.bezierCurveTo(...px(0.6, -1.6), ...px(1.2, -1.1), ...px(1.2, -0.3));
  ctx.bezierCurveTo(...px(1.2, 0), ...px(1, 1), ...px(0, 2));
  ctx.closePath();

  ctx.fillStyle = "#51cf66";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const [hx, hy] = px(0, -0.2); // was -0.9, shifted down
  ctx.beginPath();
  ctx.moveTo(hx - 4, hy);
  ctx.lineTo(hx - 1, hy + 3);
  ctx.lineTo(hx + 5, hy - 4); // was -5/-6, slightly smaller
  ctx.strokeStyle = "#1f3a1f";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  return {
    url: canvas.toDataURL(),
    scaledSize: new google.maps.Size(w, h),
    anchor: new google.maps.Point(w / 2, h),
  };
}

function showResults(guessPosition, actualPosition, score, distanceMeters) {
  const distanceElement = resultsView.querySelector(".results-distance-value");
  const scoreElement = resultsView.querySelector(".results-score-value");

  recordRoundResult(guessPosition, actualPosition, score, distanceMeters);
  updateRoundTracker();

  // Update footer values
  distanceElement.textContent =
    guessPosition && distanceMeters !== null
      ? formatDistance(distanceMeters)
      : "No guess";
  scoreElement.textContent = score.toLocaleString();

  // Hide game view, show results view
  gameView.classList.add("hidden");
  resultsView.classList.remove("hidden");
  updateResultsNextButton();

  // Initialize results map
  // I used AI to help me figure out how to use the google maps API
  resultsMap = new google.maps.Map(document.getElementById("results-map"), {
    center: STANFORD_CENTER,
    zoom: 16,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    clickableIcons: false,
  });

  // Add guess marker (cardinal red pin) - only if a guess was made
  if (guessPosition) {
    new google.maps.Marker({
      position: guessPosition,
      map: resultsMap,
      title: "Your guess",
      icon: {
        path: TEARDROP,
        scale: 9,
        fillColor: "#8C1515",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        strokeOpacity: 1,
        anchor: new google.maps.Point(0, 2),
      },
    });
  }

  new google.maps.Marker({
    position: actualPosition,
    map: resultsMap,
    title: "Actual location",
    icon: createActualMarkerIcon(),
  });

  // Draw dotted line between guess and actual location - only if a guess was made
  if (guessPosition) {
    new google.maps.Polyline({
      path: [guessPosition, actualPosition],
      map: resultsMap,
      strokeColor: "#333333",
      strokeOpacity: 0,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 0.8,
            strokeWeight: 3,
            scale: 3,
          },
          offset: "0",
          repeat: "15px",
        },
      ],
    });
  }

  // Fit map to show markers
  if (guessPosition) {
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(guessPosition);
    bounds.extend(actualPosition);
    resultsMap.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  } else {
    // No guess - just center on the actual location
    resultsMap.setCenter(actualPosition);
    resultsMap.setZoom(17);
  }
}

function recordRoundResult(
  guessPosition,
  actualPosition,
  score,
  distanceMeters,
) {
  const roundIndex = currentRound - 1;
  const distanceFeet =
    guessPosition && distanceMeters !== null
      ? Math.round(distanceMeters * 3.28084)
      : null;
  const guess = guessPosition
    ? { lat: guessPosition.lat(), lng: guessPosition.lng() }
    : null;
  const actual = {
    lat: actualPosition.lat,
    lng: actualPosition.lng,
    name: currentLocation?.name || "",
    id: currentLocation?.id,
  };

  roundScores[roundIndex] = score;
  roundDistances[roundIndex] = distanceFeet;
  roundResults[roundIndex] = {
    round: currentRound,
    location: actual,
    guess,
    score,
    distanceMeters,
    distanceFeet,
  };
}

function renderSummaryMap() {
  summaryMap = new google.maps.Map(summaryMapElement, {
    center: STANFORD_CENTER,
    zoom: 16,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    clickableIcons: false,
  });

  const bounds = new google.maps.LatLngBounds();
  let hasBounds = false;

  roundResults.forEach((result) => {
    const actualPosition = {
      lat: result.location.lat,
      lng: result.location.lng,
    };

    new google.maps.Marker({
      position: actualPosition,
      map: summaryMap,
      title: `Round ${result.round} location${result.location.name ? `: ${result.location.name}` : ""}`,
      label: {
        text: String(result.round),
        color: "#1f3a1f",
        fontWeight: "900",
      },
      icon: {
        path: TEARDROP,
        scale: 9,
        fillColor: "#51cf66",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        strokeOpacity: 1,
        anchor: new google.maps.Point(0, 2),
      },
    });
    bounds.extend(actualPosition);
    hasBounds = true;

    if (!result.guess) {
      return;
    }

    new google.maps.Marker({
      position: result.guess,
      map: summaryMap,
      title: `Round ${result.round} guess: ${result.score.toLocaleString()} pts`,
      label: {
        text: String(result.round),
        color: "#ffffff",
        fontWeight: "900",
      },
      icon: {
        path: TEARDROP,
        scale: 9,
        fillColor: "#8C1515",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 1,
        strokeOpacity: 1,
        anchor: new google.maps.Point(0, 2),
      },
    });

    new google.maps.Polyline({
      path: [result.guess, actualPosition],
      map: summaryMap,
      strokeColor: "#333333",
      strokeOpacity: 0,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 0.8,
            strokeWeight: 3,
            scale: 3,
          },
          offset: "0",
          repeat: "15px",
        },
      ],
    });

    bounds.extend(result.guess);
  });

  if (hasBounds) {
    summaryMap.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
  }
}

function hideResults() {
  document.getElementById("results-view").classList.add("hidden");
}

// ==========================================
// GUESSING MAP DISPLAY
// ==========================================

function initStreetView(lat, lng) {
  new google.maps.StreetViewPanorama(document.getElementById("street-view"), {
    position: { lat, lng },
    pov: { heading: 0, pitch: 0 },
    zoom: 1,
    addressControl: false,
    showRoadLabels: false,
    clickToGo: false,
    linksControl: false,
    panControl: true,
    zoomControl: true,
    fullscreenControl: false,
  });
}

async function loadGoogleMaps() {
  if (window.google?.maps) {
    return;
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = fetch(BASE_API_URL + "/config/maps")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Google Maps API key is not configured.");
      }

      return response.json();
    })
    .then(
      ({ apiKey }) =>
        new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
          script.async = true;
          script.defer = true;
          script.onload = resolve;
          script.onerror = () =>
            reject(new Error("Failed to load Google Maps."));
          document.head.appendChild(script);
        }),
    );

  return googleMapsPromise;
}

function initGuessMap() {
  if (guessMap) {
    google.maps.event.trigger(guessMap, "resize");
    guessMap.setCenter(STANFORD_CENTER);
    return;
  }

  guessMap = new google.maps.Map(document.getElementById("guess-map"), {
    center: STANFORD_CENTER,
    zoom: 16,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    clickableIcons: false,
    gestureHandling: "greedy",
  });

  guessMap.addListener("click", (event) => {
    placeGuess(event.latLng);
  });
}

function placeGuess(position) {
  if (!guessMarker) {
    guessMarker = new google.maps.Marker({
      map: guessMap,
      draggable: true,
      title: "Your guess",
    });
  }

  guessMarker.setPosition(position);
  guessMapPanel.classList.remove("is-open");
  guessMapPanel.classList.add("has-pin");
  updateGuessButtonState();
}

function resetGuess() {
  if (guessMarker) {
    guessMarker.setMap(null);
    guessMarker = null;
  }

  guessMapPanel.classList.remove("is-open");
  guessMapPanel.classList.remove("has-pin");
  updateGuessButtonState();
}

function resizeGuessMap() {
  if (!guessMap) {
    return;
  }

  window.setTimeout(() => {
    google.maps.event.trigger(guessMap, "resize");
  }, 220);
}

function collapseGuessMap() {
  guessMapPanel.classList.remove("is-open");
  updateGuessButtonState();
}

// ==========================================
// SCORING
// ==========================================

/**
 * Get time-based score multiplier
 * First 10 seconds: no penalty (1.0)
 * After that: decreases by 0.01 per second down to 0.5
 */
function getTimeMultiplier() {
  // First 10 seconds (timeRemaining 60-50): no penalty
  if (timeRemaining >= 50) {
    return 1.0;
  }
  // After 10 seconds: multiplier decreases from 0.99 down to 0.50
  return 0.5 + timeRemaining * 0.01;
}

/* Calculate distance between two points using Haversine formula
   (I Used AI for this function apparently its a good one for this kinda thing) */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate score based on distance from target and time remaining
 */
function calculateScore(distanceMeters) {
  const baseScore = MAX_POINTS * Math.exp(-distanceMeters / DECAY_CONSTANT);
  const multiplier = getTimeMultiplier();
  return Math.round(baseScore * multiplier);
}

function formatDistance(meters) {
  const feet = meters * 3.28084;
  const miles = meters / 1609.344;

  if (miles < 0.1) {
    return `${Math.round(feet)} ft`;
  } else {
    return `${miles.toFixed(2)} mi`;
  }
}

// ==========================================
// MAIN PAGE
// ==========================================

const leadboardBtn = document.querySelector(".leaderboard-bar");
const leaderboard = document.querySelector("#leaderboard");
const globalStats = document.querySelector("#global-stats");
const personalStats = document.querySelector("#personal-stats");
const signMsg = document.querySelector("#signin-msg");
const limit = 5;
let isAtTop = true;

leadboardBtn.addEventListener("click", toggleLeadboard);

/* Raise and lower leaderboard on main page. */
function toggleLeadboard() {
  if (isAtTop) {
    leaderboard.scrollIntoView({ behavior: "smooth" });
    isAtTop = false;
  } else {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    isAtTop = true;
  }

  updateLeaderboardButtonText();
}

/* Populate leaderboard stats. */
function pullGlobalStats(elem) {
  fetch(BASE_API_URL + `/leaderboard/${limit}`)
    .then((response) => response.json())
    .then((data) => {
      elem.replaceChildren();
      data.forEach((entry, i) => {
        let li = document.createElement("li");
        li.textContent = `${data[i].name} — ${data[i].score} pts`;
        elem.appendChild(li);
      });
    })
    .catch((error) => console.log(error));
}

/* Populate personal stats. */
function pullPersonalStats(listElem = personalStats, msgElem = signMsg) {
  listElem.replaceChildren();
  // not signed in.
  if (!userId) {
    msgElem.classList.remove("hidden");
    return;
  }

  fetch(BASE_API_URL + `/users/${userId}/scores/${limit}`)
    .then((response) => response.json())
    .then((data) => {
      data.forEach((entry, i) => {
        let li = document.createElement("li");
        li.textContent = `${userName} — ${data[i].score} pts`;
        listElem.appendChild(li);
      });
      msgElem.classList.add("hidden");
    })
    .catch((error) => console.log(error));
}

// Sign-up and Login Logic
function setupAuthButtons() {
  const signupButton = document.getElementById("signup");
  const loginButton = document.getElementById("login");
  const logoutButton = document.getElementById("logout");
  const authBackButton = document.getElementById("auth-back-button");
  const signinLink = document.getElementById("signin-link");
  const endSigninLink = document.getElementById("end-signin-link");

  signupButton.addEventListener("click", () => showAuthView("signup"));
  loginButton.addEventListener("click", () => showAuthView("login"));
  signinLink.addEventListener("click", () => showAuthView("login", "home"));
  endSigninLink.addEventListener("click", () => showAuthView("login", "end"));
  logoutButton.addEventListener("click", () => {
    userId = null;
    userName = "";
    updateWelcomeMessage();
    pullPersonalStats();
    showHome();
  });
  authBackButton.addEventListener("click", returnFromAuth);
  authSwitchButton.addEventListener("click", () => {
    authMode = authMode === "signup" ? "login" : "signup";
    updateAuthView();
    authNameInput.focus();
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = authNameInput.value.trim();
    const password = authPasswordInput.value;
    const formData = new FormData(authForm);

    if (!name) {
      setAuthFeedback("Enter a username.");
      authNameInput.focus();
      return;
    }

    if (!password) {
      setAuthFeedback("Enter a password.");
      authPasswordInput.focus();
      return;
    }

    authSubmit.disabled = true;
    setAuthFeedback(
      authMode === "signup" ? "Creating account..." : "Logging in...",
    );

    try {
      if (authMode === "signup") {
        await signup(formData);
        setAuthFeedback("Account created. Redirecting home...", {
          success: true,
        });
      } else {
        await login(formData);
        setAuthFeedback("Login successful. Redirecting home...", {
          success: true,
        });
      }

      updateWelcomeMessage();
      pullPersonalStats();
      pullPersonalStats(end_personal_list, end_signin_msg);
      window.setTimeout(returnFromAuth, 400);
    } catch (error) {
      setAuthFeedback(error.message || "Something went wrong.");
    } finally {
      authSubmit.disabled = false;
    }
  });
}

/* Game logic. */
document.addEventListener("DOMContentLoaded", () => {
  const playButton = document.querySelector(".play-button");

  updateWelcomeMessage();
  updateLeaderboardButtonText();
  updateGuessButtonState();
  updateResultsNextButton();
  pullPersonalStats(); // for leaderboard
  pullGlobalStats(globalStats);
  setupAuthButtons();
  playButton.addEventListener("click", startGame);
  guessMapPanel.addEventListener("mouseenter", resizeGuessMap);
  guessMapPanel.addEventListener("focusin", resizeGuessMap);
  guessButton.addEventListener("click", () => {
    if (!guessMarker) {
      guessMapPanel.classList.add("is-open");
      updateGuessButtonState();
      resizeGuessMap();
      return;
    }

    stopTimer();

    const guessPosition = guessMarker.getPosition();
    const actualPosition = {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
    };

    const distance = calculateDistance(
      guessPosition.lat(),
      guessPosition.lng(),
      currentLocation.lat,
      currentLocation.lng,
    );
    const score = calculateScore(distance);

    console.log("Guess submitted:", {
      guess: { lat: guessPosition.lat(), lng: guessPosition.lng() },
      answer: currentLocation,
      distance: distance,
      score: score,
    });

    showResults(guessPosition, actualPosition, score, distance);
  });

  /* Results page next button */
  resultsNextButton.addEventListener("click", () => {
    if (currentRound < TOTAL_ROUNDS) {
      // Advance to next round
      hideResults();
      currentRound++;
      startRound();
    } else {
      // Game over - start new game
      // TODO: display end game summary
      endGame();
      //alert("Total Score: " + totalScore + "\nPlay Again?");
      //startGame();
    }
  });

  document.addEventListener("click", (event) => {
    if (!guessMapPanel.contains(event.target)) {
      collapseGuessMap();
    }
  });
});
