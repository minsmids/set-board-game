/* ===== SET Multiplayer for Telegram Web App =====
   Pure JavaScript bundle (no HTML / <script> tags).
   Requires the following globals loaded *before* this file:
     1) Telegram Web App SDK – https://telegram.org/js/telegram-web-app.js
     2) Firebase v8 (app + database) – firebase-app.js / firebase-database.js
*/

/******************* Firebase CONFIG *******************/
/*  ⚠️  Замените ниже на свой объект из Firebase Console.   */
const firebaseConfig = {
  apiKey: "AIzaSyD5X8yyI8CzxDdlenFLS13QOFKU3CevQrs",
  authDomain: "set-telegram.firebaseapp.com",
  databaseURL: "https://set-telegram-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "set-telegram",
  storageBucket: "set-telegram.firebasestorage.app",
  messagingSenderId: "772429781868",
  appId: "1:772429781868:web:bbdf0385402df96e36b149",
  measurementId: "G-SSKXER5X99"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/******************* Global state *******************/
let nickname = "";
let selected = [];
let availableCards = [];
const COLORS = ["red", "green", "purple"];

/******************* Telegram integration & bootstrap *******************/
document.addEventListener("DOMContentLoaded", () => {
  // If launched inside Telegram Web-view → auto-login
  if (window.Telegram?.WebApp?.initData) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();

    const u = Telegram.WebApp.initDataUnsafe.user || {};
    nickname =
      u.username || `${u.first_name || "user"}_${u.id || Date.now()}`;

    joinGame(); // skip manual form
  } else {
    // In normal browser show login form
    document.getElementById("login").style.display = "block";
  }
});

/******************* Core game logic *******************/
function joinGame() {
  if (!nickname) {
    nickname = document.getElementById("nickname").value.trim();
    if (!nickname) return alert("Введите имя");
  }

  // Switch UI
  document.getElementById("login").style.display = "none";
  document.getElementById("game").style.display = "block";

  // Register player
  db.ref(`players/${nickname}`).set({ score: 0 });

  // Init deck once
  db.ref("game/cards").once("value", (snap) => {
    if (!snap.exists()) initializeGame();
  });

  // Realtime listeners
  db.ref("game/cards").on("value", (snap) =>
    drawBoard(snap.val() || [])
  );

  db.ref("players").on("value", (snap) => {
    const players = snap.val() || {};
    document.getElementById("players").innerHTML = Object.entries(
      players
    )
      .map(([name, { score = 0 }]) => `<span>${name}: ${score}</span>`)
      .join("&nbsp;&nbsp;");
  });
}

function initializeGame() {
  db.ref("players").remove(); // reset scores

  // Build new deck
  availableCards = [];
  for (let c = 0; c < 3; c++)
    for (let s = 0; s < 3; s++)
      for (let f = 0; f < 3; f++)
        for (let n = 1; n <= 3; n++) availableCards.push([c, s, f, n]);

  shuffle(availableCards);

  // Deal 12 cards
  const initial = availableCards.splice(0, 12);
  db.ref("game/cards").set(initial);
  db.ref("game/availableCards").set(availableCards);
  selected = [];
}

function newGame() {
  if (confirm("Начать новую игру?")) initializeGame();
}

function addMoreCards() {
  db.ref("game").once("value", (snap) => {
    const g = snap.val() || {};
    const cards = g.cards || [];
    const avail = g.availableCards || [];

    if (avail.length >= 3) {
      const add = avail.splice(0, 3);
      db.ref("game/cards").set([...cards, ...add]);
      db.ref("game/availableCards").set(avail);
    } else alert("Нет больше карт!");
  });
}

/******************* Helpers *******************/
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function countSets(cards) {
  let count = 0;
  const n = cards.length;
  if (n < 3) return 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const isSet = [0, 1, 2, 3].every((prop) => {
          const s = new Set([cards[i][prop], cards[j][prop], cards[k][prop]]);
          return s.size === 1 || s.size === 3;
        });
        if (isSet) count++;
      }
    }
  }
  return count;
}

function drawBoard(cards) {
  const board = document.getElementById("board");
  if (!board) return;
  board.innerHTML = "";

  // Fix scrolling issue dynamically
  const boardContainer = board.parentElement;
  if (boardContainer) {
    boardContainer.style.overflowY = "auto";
    boardContainer.style.maxHeight = "calc(100vh - 100px)"; // Leave space for info/controls
  }

  // Find or create the counter element and place it before the player list
  let counterEl = document.getElementById("sets-count");
  const playersEl = document.getElementById("players");
  if (!counterEl && playersEl) {
      counterEl = document.createElement("div");
      counterEl.id = "sets-count";
      playersEl.before(counterEl);
  }
  
  if(counterEl) {
    counterEl.innerText = `Возможных сетов: ${countSets(cards)}`;
  }


  cards.forEach((card, idx) => {
    const div = document.createElement("div");
    div.className = "card";
    if (selected.includes(idx)) div.classList.add("selected");
    div.onclick = () => selectCard(idx);

    const [color, shape, fill, count] = card;
    const colorText = COLORS[color];

    for (let n = 0; n < count; n++) {
      const el = document.createElement("div");
      el.className = "symbol";
      el.innerHTML = getSVG(shape, fill, colorText);
      div.appendChild(el);
    }
    board.appendChild(div);
  });
}

function getSVG(shape, fill, color) {
  const pId = `stripes-${color}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const fillType = { 0: "none", 1: `url(#${pId})`, 2: color }[fill];
  const stroke = color;

  if (shape === 0)
    return `
<svg viewBox="0 0 100 50">
  <defs>
    <pattern id="${pId}" patternUnits="userSpaceOnUse" width="4" height="4">
      <path d="M0,0 l4,4" stroke="${color}" stroke-width="1" />
    </pattern>
  </defs>
  <ellipse cx="50" cy="25" rx="40" ry="15"
           fill="${fillType}" stroke="${stroke}" stroke-width="3" />
</svg>`.trim();

  if (shape === 1)
    return `
<svg viewBox="0 0 100 50">
  <defs>
    <pattern id="${pId}" patternUnits="userSpaceOnUse" width="4" height="4">
      <path d="M0,0 l4,4" stroke="${color}" stroke-width="1" />
    </pattern>
  </defs>
  <polygon points="50,5 95,25 50,45 5,25"
           fill="${fillType}" stroke="${stroke}" stroke-width="3" />
</svg>`.trim();

  if (shape === 2)
    return `
<svg viewBox="0 0 100 50">
  <defs>
    <pattern id="${pId}" patternUnits="userSpaceOnUse" width="4" height="4">
      <path d="M0,0 l4,4" stroke="${color}" stroke-width="1" />
    </pattern>
  </defs>
  <path d="M10 35 Q25 15 40 35 Q55 15 70 35
           Q85 15 90 35 L90 45
           Q85 45 70 45 Q55 45 40 45 Q25 45 10 45 Z"
        fill="${fillType}" stroke="${stroke}" stroke-width="3" />
</svg>`.trim();

  return "";
}

function selectCard(idx) {
  selected = selected.includes(idx)
    ? selected.filter((i) => i !== idx)
    : [...selected, idx];

  if (selected.length === 3) checkSet();

  db.ref("game/cards").once("value", (s) => drawBoard(s.val()));
}

function checkSet() {
  db.ref("game").once("value", (snap) => {
    const g = snap.val() || {};
    const cards = g.cards || [];
    const avail = g.availableCards || [];

    const [a, b, c] = selected.map((i) => cards[i]);
    const isSet = [0, 1, 2, 3].every((i) => {
      const s = new Set([a[i], b[i], c[i]]);
      return s.size === 1 || s.size === 3;
    });

    if (isSet) {
      let newCards = [...cards];
      // remove from highest index to lowest
      selected.sort((x, y) => y - x).forEach((i) => newCards.splice(i, 1));

      if (newCards.length < 12 && avail.length >= 3) {
        newCards = [...newCards, ...avail.splice(0, 3)];
        db.ref("game/availableCards").set(avail);
      }

      db.ref("game/cards").set(newCards);
      db.ref(`players/${nickname}/score`).transaction(
        (score) => (score || 0) + 1
      );
      Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
    } else {
      alert("Это не SET. Попробуйте ещё раз.");
    }

    selected = [];
  });
}
