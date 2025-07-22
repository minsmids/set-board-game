/* ===== SET Multiplayer (room-based) for Telegram Web App =====
   Pure JavaScript bundle (no HTML <script> tags).
   Requires the following globals loaded *before* this file:
     1) Telegram Web-App SDK – https://telegram.org/js/telegram-web-app.js
     2) Firebase v8 (app + database) – firebase-app.js / firebase-database.js
*/

/******************* Firebase CONFIG ********************/
const firebaseConfig = {
  apiKey: "AIzaSy…",  // ←— замените на свои ключи
  authDomain: "set-telegram.firebaseapp.com",
  databaseURL: "https://set-telegram-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "set-telegram",
  storageBucket: "set-telegram.appspot.com",
  messagingSenderId: "772429781868",
  appId: "1:772429781868:web:bbdf0385402df96e36b149",
  // ... другие параметры конфигурации Firebase
};

/******************* Firebase INIT ********************/
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let nickname = "";
let currentRoomId = null;

/******************* Telegram INIT ********************/
const tg = window.Telegram.WebApp;
tg.expand();

/******************* UI HELPERS ********************/
function showSection(sectionId) {
  ["login", "lobby", "game"].forEach(id => {
    document.getElementById(id).style.display = (id === sectionId) ? "block" : "none";
  });
}

/******************* Login & Lobby ********************/
function manualLogin() {
  const input = document.getElementById("nickname");
  if (!input.value.trim()) return alert("Введите имя");
  nickname = input.value.trim();
  showSection("lobby");
}

function createNewRoom() {
  const roomId = db.ref("rooms").push().key;
  joinRoom(roomId, true);
}

function joinRoomByCode() {
  const code = document.getElementById("room-code-input").value.trim();
  if (!code) return alert("Введите код комнаты");
  joinRoom(code, false);
}

/******************* Core room handshake ********************/
function joinRoom(roomId, isHost = false) {
  currentRoomId = roomId;

  // Отображение нужных блоков
  showSection("game");

  // Показ кода комнаты и счётчика возможных сетов
  document.getElementById("room-code-display").innerText = "Комната: " + roomId;
  db.ref(`rooms/${roomId}/game/setsCount`)
    .on("value", snap => {
      document.getElementById("sets-count").innerText = "Сеты: " + (snap.val() || 0);
    });

  // Генерация ссылки-приглашения
  const linkInput = document.getElementById("invite-link");
  const bot = (tg.initDataUnsafe || {}).bot_username || "setboardgame_bot";
  const link = `https://t.me/${bot}/setgame?startapp=${currentRoomId}`;
  linkInput.value = link;
  linkInput.style.display = "block";
  linkInput.onclick = () => linkInput.select();

  // Если хост, сначала инициализируем игровую комнату
  if (isHost) {
    initializeGame();
  }

  // Добавляем игрока в комнату и сохраняем сессию
  db.ref(`rooms/${roomId}/players/${nickname}`).set({ score: 0 });
  db.ref(`playerSessions/${nickname}`).set(roomId);

  // Подписки на изменения доски и игроков
  db.ref(`rooms/${roomId}/game/cards`)
    .on("value", snap => drawBoard(snap.val() || []));

  db.ref(`rooms/${roomId}/players`)
    .on("value", snap => {
      const players = snap.val() || {};
      const list = Object.entries(players)
        .map(([n, { score = 0 }]) => `${n}: ${score}`)
        .join("\n");
      document.getElementById("players").innerText = list;
    });
}

/******************* Game Logic ********************/
function initializeGame() {
  const deck = generateDeck();
  const avail = shuffle(deck);
  const initialCards = avail.splice(0, 12);
  db.ref(`rooms/${currentRoomId}/game/availableCards`).set(avail);
  db.ref(`rooms/${currentRoomId}/game/cards`).set(initialCards);
  db.ref(`rooms/${currentRoomId}/game/setsCount`).set(countSets(initialCards));
}

function addMoreCards() {
  db.ref(`rooms/${currentRoomId}/game/availableCards`).once("value", snap => {
    const avail = snap.val() || [];
    if (avail.length < 3) return alert("Карт больше нет");
    const extra = avail.splice(0, 3);
    db.ref(`rooms/${currentRoomId}/game/availableCards`).set(avail);
    db.ref(`rooms/${currentRoomId}/game/cards`).once("value", s => {
      const cards = s.val() || [];
      db.ref(`rooms/${currentRoomId}/game/cards`).set([...cards, ...extra]);
    });
  });
}

function newGame() {
  if (confirm("Начать новую игру?")) {
    initializeGame();
    db.ref(`rooms/${currentRoomId}/players`).set(null);
  }
}

function endGame() {
  if (confirm("Завершить игру и выйти?")) {
    db.ref(`playerSessions/${nickname}`).set(null);
    window.location.reload();
  }
}

/******************* Board Rendering ********************/
function drawBoard(cards) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  cards.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = getSVG(card.shape, card.fill, card.color);
    el.onclick = () => selectCard(idx);
    board.appendChild(el);
  });
}

/******************* Card Selection & Checking ********************/
let selected = [];

function selectCard(idx) {
  const i = selected.indexOf(idx);
  if (i >= 0) {
    selected.splice(i, 1);
  } else if (selected.length < 3) {
    selected.push(idx);
  }
  highlightSelected();
  if (selected.length === 3) {
    checkSet();
  }
}

function highlightSelected() {
  Array.from(document.getElementById("board").children)
    .forEach((el, i) => {
      el.classList.toggle("selected", selected.includes(i));
    });
}

function checkSet() {
  db.ref(`rooms/${currentRoomId}/game/cards`).once("value", snap => {
    const cards = snap.val() || [];
    const triplet = selected.map(i => cards[i]);
    const isSet = validateSet(triplet);
    if (isSet) {
      let newCards = [...cards];
      selected.sort((a,b) => b - a).forEach(i => newCards.splice(i, 1));
      db.ref(`rooms/${currentRoomId}/game/availableCards`).once("value", s => {
        const avail = s.val() || [];
        if (newCards.length < 12 && avail.length >= 3) {
          const extra = avail.splice(0, 3);
          newCards = [...newCards, ...extra];
          db.ref(`rooms/${currentRoomId}/game/availableCards`).set(avail);
        }
        db.ref(`rooms/${currentRoomId}/game/cards`).set(newCards);
      });
      db.ref(`rooms/${currentRoomId}/players/${nickname}/score`)
        .transaction(s => (s || 0) + 1);
      tg?.HapticFeedback?.impactOccurred("light");
    } else {
      alert("Это не сет");
      tg?.HapticFeedback?.impactOccurred("rigid");
    }
    selected = [];
    highlightSelected();
  });
}

/******************* Helpers: Deck, Shuffle, Count, Validate ********************/
function generateDeck() {
  const deck = [];
  for (let shape = 0; shape < 3; shape++) {
    for (let fill = 0; fill < 3; fill++) {
      for (let color = 0; color < 3; color++) {
        for (let count = 1; count <= 3; count++) {
          deck.push({ shape, fill, color, count });
        }
      }
    }
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function countSets(cards) {
  let cnt = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i+1; j < cards.length; j++) {
      for (let k = j+1; k < cards.length; k++) {
        if (validateSet([cards[i], cards[j], cards[k]])) cnt++;
      }
    }
  }
  return cnt;
}

function validateSet([a, b, c]) {
  return ["shape", "fill", "color", "count"].every(prop =>
    (a[prop] + b[prop] + c[prop]) % 3 === 0
  );
}

/* SVG-генератор: shape 0=овал, 1=ромб, 2=волна; fill 0=пустой, 1=штрих, 2=заливка */
function getSVG(shape, fill, color) {
  const pid      = `pat-${color}-${Math.random().toString(36).slice(2)}`,
        fillAttr = {0: "none", 1: `url(#${pid})`, 2: color}[fill],
        stroke   = color,
        pat      = `<pattern id="${pid}" width="4" height="4" patternUnits="userSpaceOnUse">
                      <path d="M0 0 l4 4" stroke="${color}" stroke-width="1"/>
                    </pattern>`;
  const wrap = body => `<svg viewBox="0 0 100 50"><defs>${fill === 1 ? pat : ""}</defs>${body}</svg>`;

  if (shape === 0) return wrap(`<ellipse cx="50" cy="25" rx="40" ry="15" fill="${fillAttr}" stroke="${stroke}" stroke-width="3"/>`);
  if (shape === 1) return wrap(`<polygon points="50,5 95,25 50,45 5,25" fill="${fillAttr}" stroke="${stroke}" stroke-width="3"/>`);
  if (shape === 2) return wrap(`<path d="M10 35 Q25 15 40 35 Q55 15 70 35 Z" fill="${fillAttr}" stroke="${stroke}" stroke-width="3"/>`);
  return "";
}