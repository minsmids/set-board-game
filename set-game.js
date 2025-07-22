/* ===== SET Multiplayer (Room-based) for Telegram Web App =====
   Pure JavaScript bundle (no HTML / <script> tags).
   Requires the following globals loaded *before* this file:
     1) Telegram Web App SDK – https://telegram.org/js/telegram-web-app.js
     2) Firebase v8 (app + database) – firebase-app.js / firebase-database.js
*/

/******************* Firebase CONFIG ********************/
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

/******************* Global state ********************/
let nickname = "";
let currentRoomId = null;
let selected = [];
const COLORS = ["red", "green", "purple"];

/******************* Telegram integration & bootstrap ********************/
document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram?.WebApp;
  console.log("DOMContentLoaded fired.");
  console.log("Telegram WebApp object:", tg);

  // Check if the app is running in Telegram and user data is available
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    console.log("Running in Telegram WebApp.");
    tg.ready();
    tg.expand();

    const u = tg.initDataUnsafe.user;
    console.log("Telegram user data:", u);
    // Use username if available, otherwise construct a name
    nickname = u.username || `${u.first_name || "user"}_${u.last_name || u.id}`;
    console.log("Assigned nickname:", nickname);
    
    const roomIdFromLink = tg.initDataUnsafe.start_param;
    console.log("Room ID from link:", roomIdFromLink);
    
    loginUser(roomIdFromLink);
  } else {
    console.log("Not running in Telegram WebApp or user data not available. Showing login form.");
    // Fallback for regular browser environment
    document.getElementById("login").style.display = "block";
  }
});

// Called from login form if not in Telegram
function manualLogin() {
    console.log("manualLogin called.");
    const nicknameInput = document.getElementById("nickname");
    if (nicknameInput) {
        nickname = nicknameInput.value.trim();
        console.log("Manual nickname input:", nickname);
    }
    
    if (!nickname) {
        alert("Введите имя");
        return;
    }
    loginUser();
}

async function loginUser(roomIdFromLink = null) {
    console.log(`loginUser called with nickname: ${nickname}, roomIdFromLink: ${roomIdFromLink}`);
    // 1. Check for an existing session
    const sessionSnap = await db.ref(`playerSessions/${nickname}`).once("value");
    const existingRoomId = sessionSnap.val();
    console.log("Existing room ID from session:", existingRoomId);

    if (existingRoomId) {
        const roomSnap = await db.ref(`rooms/${existingRoomId}`).once("value");
        if (roomSnap.exists()) {
            console.log(`Reconnecting to room: ${existingRoomId}`);
            joinRoom(existingRoomId);
            return;
        } else {
            console.log("Stale session found, cleaning up.");
            // Clean up stale session
            db.ref(`playerSessions/${nickname}`).remove();
        }
    }
    
    // 2. If invited to a specific room, join it
    if (roomIdFromLink) {
        const roomSnap = await db.ref(`rooms/${roomIdFromLink}`).once("value");
        if (roomSnap.exists()) {
            console.log(`Joining invited room: ${roomIdFromLink}`);
            joinRoom(roomIdFromLink);
        } else {
            alert("Комната, в которую вас пригласили, уже не существует. Создайте новую.");
            showLobby();
        }
        return;
    }

    // 3. Otherwise, show the lobby to create/join a room
    console.log("No existing session or invited room. Showing lobby.");
    showLobby();
}

function showLobby() {
    console.log("showLobby called.");
    const loginDiv = document.getElementById("login");
    const lobbyDiv = document.getElementById("lobby");
    const gameDiv = document.getElementById("game");

    if (loginDiv) loginDiv.style.display = "none";
    if (lobbyDiv) lobbyDiv.style.display = "block";
    if (gameDiv) gameDiv.style.display = "none";
    console.log("UI display states: login=", loginDiv?.style.display, ", lobby=", lobbyDiv?.style.display, ", game=", gameDiv?.style.display);
}

/******************* Core game logic ********************/
async function createNewRoom() {
    let newRoomCode = generateRoomCode();
    let attempts = 0;
    const maxAttempts = 10; // Prevent infinite loops

    // Check for uniqueness
    while (await db.ref(`rooms/${newRoomCode}`).once("value").then(s => s.exists()) && attempts < maxAttempts) {
        newRoomCode = generateRoomCode();
        attempts++;
    }

    if (attempts === maxAttempts) {
        alert("Не удалось создать уникальный код комнаты. Попробуйте еще раз.");
        return;
    }

    currentRoomId = newRoomCode;
    console.log(`Creating new room: ${currentRoomId}`);
    joinRoom(currentRoomId, true);
}

function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit number
}

async function joinRoomByCode() {
    const codeInput = document.getElementById("room-code-input");
    const code = codeInput ? codeInput.value.trim() : "";

    if (!code || code.length !== 6 || !/^[0-9]+$/.test(code)) {
        alert("Пожалуйста, введите корректный 6-значный код комнаты.");
        return;
    }

    const roomSnap = await db.ref(`rooms/${code}`).once("value");
    if (roomSnap.exists()) {
        console.log(`Joining room by code: ${code}`);
        joinRoom(code);
    } else {
        alert("Комната с таким кодом не найдена.");
    }
}

function joinRoom(roomId, isHost = false) {
    currentRoomId = roomId;

    // Switch UI
    document.getElementById("login").style.display = "none";
    document.getElementById("lobby").style.display = "none";
    document.getElementById("game").style.display = "block";
    
    // Update invite button
    const inviteButton = document.getElementById("invite-btn");
    if (inviteButton) {
        const botUsername = Telegram.WebApp.initDataUnsafe.bot_username || "setboardgame_bot"; // Fallback for testing
        const inviteLink = `https://t.me/${botUsername}?startapp=${currentRoomId}`;
        inviteButton.onclick = () => Telegram.WebApp.openTelegramLink(inviteLink);
        inviteButton.style.display = "block";
    }

    // Register player in the room and set session
    db.ref(`rooms/${currentRoomId}/players/${nickname}`).set({ score: 0 });
    db.ref(`playerSessions/${nickname}`).set(currentRoomId);

    // If host, initialize the game
    if (isHost) {
        initializeGame();
    }

    // Realtime listeners for the specific room
    db.ref(`rooms/${currentRoomId}/game/cards`).on("value", (snap) =>
        drawBoard(snap.val() || [])
    );

    db.ref(`rooms/${currentRoomId}/players`).on("value", (snap) => {
        const players = snap.val() || {};
        const playersEl = document.getElementById("players");
        if (playersEl) {
            playersEl.innerHTML = Object.entries(players)
                .map(([name, { score = 0 }]) => `<span>${name}: ${score}</span>`)
                .join("&nbsp;&nbsp;");
        }
    });
}

function initializeGame() {
    if (!currentRoomId) return;
    
    db.ref(`rooms/${currentRoomId}/players`).remove(); // reset scores

    let availableCards = [];
    for (let c = 0; c < 3; c++)
        for (let s = 0; s < 3; s++)
            for (let f = 0; f < 3; f++)
                for (let n = 1; n <= 3; n++) availableCards.push([c, s, f, n]);

    shuffle(availableCards);

    const initial = availableCards.splice(0, 12);
    const gameRef = db.ref(`rooms/${currentRoomId}/game`);
    gameRef.child("cards").set(initial);
    gameRef.child("availableCards").set(availableCards);
    selected = [];
}

function newGame() {
    if (confirm("Начать новую игру в этой комнате?")) {
        initializeGame();
    }
}

function addMoreCards() {
    if (!currentRoomId) return;
    db.ref(`rooms/${currentRoomId}/game`).once("value", (snap) => {
        const g = snap.val() || {};
        const cards = g.cards || [];
        const avail = g.availableCards || [];

        if (avail.length >= 3) {
            const add = avail.splice(0, 3);
            db.ref(`rooms/${currentRoomId}/game/cards`).set([...cards, ...add]);
            db.ref(`rooms/${currentRoomId}/game/availableCards`).set(avail);
        } else {
            alert("Нет больше карт!");
        }
    });
}

/******************* Helpers ********************/
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

    const boardContainer = board.parentElement;
    if (boardContainer) {
        boardContainer.style.overflowY = "auto";
        boardContainer.style.maxHeight = "calc(100vh - 120px)";
    }

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

    // Display room code
    let roomCodeEl = document.getElementById("room-code-display");
    if (!roomCodeEl && playersEl) {
        roomCodeEl = document.createElement("div");
        roomCodeEl.id = "room-code-display";
        playersEl.before(roomCodeEl); // Place it before players list
    }
    if (roomCodeEl && currentRoomId) {
        roomCodeEl.innerText = `Код комнаты: ${currentRoomId}`;
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
    const pId = `stripes-${color}-${Math.random().toString(36).substr(2, 9)}`;
    const fillType = { 0: "none", 1: `url(#${pId})`, 2: color }[fill];
    const stroke = color;

    // SVG definitions remain the same...
    if (shape === 0) return `<svg viewBox="0 0 100 50"><defs><pattern id="${pId}" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0,0 l4,4" stroke="${color}" stroke-width="1" /></pattern></defs><ellipse cx="50" cy="25" rx="40" ry="15" fill="${fillType}" stroke="${stroke}" stroke-width="3" /></svg>`.trim();
    if (shape === 1) return `<svg viewBox="0 0 100 50"><defs><pattern id="${pId}" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0,0 l4,4" stroke="${color}" stroke-width="1" /></pattern></defs><polygon points="50,5 95,25 50,45 5,25" fill="${fillType}" stroke="${stroke}" stroke-width="3" /></svg>`.trim();
    if (shape === 2) return `<svg viewBox="0 0 100 50"><defs><pattern id="${pId}" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0,0 l4,4" stroke="${color}" stroke-width="1" /></pattern></defs><path d="M10 35 Q25 15 40 35 Q55 15 70 35 Q85 15 90 35 L90 45 Q85 45 70 45 Q55 45 40 45 Q25 45 10 45 Z" fill="${fillType}" stroke="${stroke}" stroke-width="3" /></svg>`.trim();
    return "";
}

function selectCard(idx) {
    selected = selected.includes(idx)
        ? selected.filter((i) => i !== idx)
        : [...selected, idx];

    if (selected.length === 3) {
        checkSet();
    } else {
        // Just redraw to show selection
        db.ref(`rooms/${currentRoomId}/game/cards`).once("value", (s) => drawBoard(s.val()));
    }
}

function checkSet() {
    if (!currentRoomId) return;
    db.ref(`rooms/${currentRoomId}/game`).once("value", (snap) => {
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
            selected.sort((x, y) => y - x).forEach((i) => newCards.splice(i, 1));

            if (newCards.length < 12 && avail.length >= 3) {
                newCards = [...newCards, ...avail.splice(0, 3)];
                db.ref(`rooms/${currentRoomId}/game/availableCards`).set(avail);
            }

            db.ref(`rooms/${currentRoomId}/game/cards`).set(newCards);
            db.ref(`rooms/${currentRoomId}/players/${nickname}/score`).transaction(
                (score) => (score || 0) + 1
            );
            Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } else {
            alert("Это не SET. Попробуйте ещё раз.");
        }

        selected = [];
        // Redraw after check regardless of outcome
        db.ref(`rooms/${currentRoomId}/game/cards`).once("value", (s) => drawBoard(s.val()));
    });
}

function endGame() {
    if (!currentRoomId) return;
    if (confirm("Вы уверены, что хотите завершить игру и удалить комнату?")) {
        db.ref(`rooms/${currentRoomId}`).remove()
            .then(() => {
                console.log(`Room ${currentRoomId} removed.`);
                currentRoomId = null;
                showLobby();
            })
            .catch(error => {
                console.error("Error removing room:", error);
                alert("Не удалось завершить игру. Попробуйте еще раз.");
            });
    }
}
/* === динамическая раскладка карт === */
function layoutCards () {
  const GAP = 10;                                   // такой же, как в CSS
  const board        = document.getElementById('board');
  const boardBox     = document.getElementById('board-container');
  const totalCards   = board.children.length;
  if (!totalCards) return;

  const W = boardBox.clientWidth;
  const H = boardBox.clientHeight;
  let bestCols = 1, bestW = W;                      // запасной вариант

  // перебираем количество колонок от 1 до N
  for (let cols = 1; cols <= totalCards; cols++) {
    const wCard = (W - GAP * (cols - 1)) / cols;
    const hCard = wCard * 3 / 2;                    // aspect 2:3 → H = W·1.5
    const rows  = Math.ceil(totalCards / cols);
    const needH = rows * hCard + GAP * (rows - 1);

    if (needH <= H) {                               // всё влезло!
      bestCols = cols;
      bestW    = wCard;
      break;
    }
  }

  // применяем размеры
  [...board.children].forEach(el => {
    el.style.width  = `${bestW}px`;
    el.style.height = `${bestW * 3 / 2}px`;
  });
}

/* вызвать после любой перерисовки поля */
function renderBoard (cards) {
  // ...ваш существующий код создания <div class="card">…...
  layoutCards();
}

window.addEventListener('resize', layoutCards);
