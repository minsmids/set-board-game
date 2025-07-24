/* ===== SET Multiplayer (room-based) for Telegram Web App =====
   Pure JavaScript bundle (no HTML <script> tags).
   Requires the following globals loaded *before* this file:
     1) Telegram Web-App SDK – https://telegram.org/js/telegram-web-app.js
     2) Firebase v8 (app + database) – firebase-app.js / firebase-database.js
*/

/******************* Firebase CONFIG ********************/
const firebaseConfig = {
  apiKey: "AIzaSy…",                     // ←--­ свои ключи
  authDomain: "set-telegram.firebaseapp.com",
  databaseURL: "https://set-telegram-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "set-telegram",
  storageBucket: "set-telegram.appspot.com",
  messagingSenderId: "772429781868",
  appId: "1:772429781868:web:bbdf0385402df96e36b149",
  measurementId: "G-SSKXER5X99"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/******************* Global state ********************/
let nickname       = "";
let currentRoomId  = null;
let selected       = [];
const COLORS       = ["red", "green", "purple"];

/******************* Telegram bootstrap ********************/
document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram?.WebApp;

  if (tg && tg.initDataUnsafe?.user) {          // запущено в Telegram
    tg.ready(); tg.expand();

    const u = tg.initDataUnsafe.user;
    nickname = u.username || `${u.first_name || "user"}_${u.id}`;

    loginUser(tg.initDataUnsafe.start_param);   // если пришли по приглашению
  } else {
    document.getElementById("login").style.display = "block"; // обычный браузер
  }
});

/******************* Auth flows ********************/
function manualLogin() {
  nickname = document.getElementById("nickname")?.value.trim();
  if (!nickname) { alert("Введите имя"); return; }
  loginUser();
}

async function loginUser(roomIdFromLink = null) {
  // 1) попытка восстановить предыдущую сессию
  const snap = await db.ref(`playerSessions/${nickname}`).once("value");
  const prevRoom = snap.val();
  if (prevRoom && (await db.ref(`rooms/${prevRoom}`).once("value")).exists()) {
    joinRoom(prevRoom); return;
  }
  if (prevRoom) db.ref(`playerSessions/${nickname}`).remove();   // зачистить «битую» сессию

  // 2) если пришли по приглашению
if (roomIdFromLink) {
  const roomRef = db.ref(`rooms/${roomIdFromLink}`);
  const roomSnap = await roomRef.once("value");

  if (!roomSnap.exists()) {
    // создаём пустую комнату
    await roomRef.set({ createdAt: Date.now(), players: {} });
  }

  joinRoom(roomIdFromLink);
  return;
}

  // 3) новый пользователь – показываем лобби
  showLobby();
}

function showLobby() {
  ["login","game"].forEach(id => document.getElementById(id).style.display = "none");
  document.getElementById("lobby").style.display = "block";
}

/******************* Lobby actions ********************/
async function createNewRoom() {
  let code, attempts = 0;
  do { code = Math.floor(100000 + Math.random()*900000).toString(); }           // 6-digits
  while ((await db.ref(`rooms/${code}`).once("value")).exists() && ++attempts<10);
  if (attempts===10) return alert("Не удалось создать комнату, попробуйте ещё");
  currentRoomId = code;

  // Создаем комнату и сразу инициализируем игру
  await db.ref(`rooms/${code}`).set({
    createdAt: Date.now(),
    players: {},
    game: {
      cards: [],
      availableCards: []
    }
  });
  initializeGame(); // Инициализируем игру для новой комнаты

  joinRoom(code); // Присоединяемся к комнате (без флага isHost)
}

async function joinRoomByCode() {
  const code = document.getElementById("room-code-input")?.value.trim();
  if (!/^\d{6}$/.test(code)) return alert("Введите корректный 6-значный код");
  if (!(await db.ref(`rooms/${code}`).once("value")).exists())
    return alert("Комната не найдена");
  joinRoom(code);
}

/******************* Core room handshake ********************/
function joinRoom(roomId) {
  currentRoomId = roomId;

  document.getElementById("login").style.display  = "none";
  document.getElementById("lobby").style.display  = "none";
  document.getElementById("game").style.display   = "block";

  /* приглашение – ссылка вида
     https://t.me/<bot>/setgame?startapp=<roomId>                         */
  const btn = document.getElementById("invite-btn");
  if (btn) {
    const bot = Telegram.WebApp.initDataUnsafe.bot_username || "setboardgame_bot";
    const link = `https://t.me/${bot}/setgame?startapp=${currentRoomId}`;     // 
btn.onclick = () => {
  const shareText = "Присоединяйся ко мне в игре SET!";
  const shareUrl  = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;
  Telegram.WebApp.openTelegramLink(shareUrl);
};
    btn.style.display = "block";
  }

  // Присоединяемся к игрокам. Если игрок новый, его счёт 0.
  // Иначе — счёт сохраняется (транзакция отменяется).
  const playerRef = db.ref(`rooms/${roomId}/players/${nickname}`);
  playerRef.transaction(playerData => {
    if (playerData === null) return { score: 0 }; // Игрок не существует, создаём его
    return; // Игрок уже есть, отменяем транзакцию
  });

  db.ref(`playerSessions/${nickname}`).set(roomId);

  db.ref(`rooms/${roomId}/game/cards`)
    .on("value", snap => drawBoard(snap.val() || []));
  db.ref(`rooms/${roomId}/players`)
    .on("value", snap => {
      const list = Object.entries(snap.val()||{})
        .map(([n,{score=0}])=>`${n}: ${score}`).join("  ");
      document.getElementById("players").innerHTML = list;
    });
}

/******************* Game lifecycle ********************/
function initializeGame() {
  db.ref(`rooms/${currentRoomId}/players`).remove();      // reset scores

  const deck = [];
  for (let c=0;c<3;c++) for (let s=0;s<3;s++)
    for (let f=0;f<3;f++) for (let n=1;n<=3;n++) deck.push([c,s,f,n]);
  shuffle(deck);

  db.ref(`rooms/${currentRoomId}/game`).set({
    cards          : deck.splice(0,12),
    availableCards : deck
  });
  selected = [];
}

function newGame()        { if (confirm("Новая партия?")) initializeGame(); }
function addMoreCards()   {
  db.ref(`rooms/${currentRoomId}/game`).once("value", snap => {
    const {cards=[],availableCards:avail=[]} = snap.val()||{};
    if (avail.length<3) return alert("Нет больше карт!");
    db.ref(`rooms/${currentRoomId}/game`).update({
      cards: [...cards, ...avail.splice(0,3)],
      availableCards: avail
    });
  });
}

/******************* Interaction ********************/
function selectCard(idx) {
  selected = selected.includes(idx) ? selected.filter(i=>i!==idx) : [...selected, idx];
  if (selected.length === 3) checkSet();
  else db.ref(`rooms/${currentRoomId}/game/cards`).once("value", s => drawBoard(s.val()));
}

function checkSet() {
  const selectedCardsIndices = [...selected]; // Копируем, чтобы избежать гонок
  selected = []; // Сразу сбрасываем локальный выбор

  const gameRef = db.ref(`rooms/${currentRoomId}/game`);

  gameRef.transaction(gameData => {
    if (!gameData) return gameData; // Если данных нет, выходим

    // Убедимся, что все выбранные карты все еще на столе
    const allCards = gameData.cards || [];
    if (selectedCardsIndices.some(idx => !allCards[idx])) {
      // Одна из карт уже была убрана, отменяем транзакцию
      // Ничего не возвращаем (undefined), чтобы Firebase отменил транзакцию
      return;
    }

    const [a, b, c] = selectedCardsIndices.map(i => allCards[i]);
    const isSet = [0, 1, 2, 3].every(i => {
      const s = new Set([a[i], b[i], c[i]]);
      return s.size === 1 || s.size === 3;
    });

    if (isSet) {
      // Успех! Убираем карты и добавляем новые
      let newCards = [...allCards];
      let avail = gameData.availableCards || [];

      selectedCardsIndices.sort((x, y) => y - x).forEach(i => newCards.splice(i, 1));

      if (newCards.length < 12 && avail.length >= 3) {
        newCards.push(...avail.splice(0, 3));
      }

      gameData.cards = newCards;
      gameData.availableCards = avail;

      // Начисляем очко игроку (вне этой транзакции, чтобы не усложнять)
      db.ref(`rooms/${currentRoomId}/players/${nickname}/score`).transaction(s => (s || 0) + 1);
      Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");

    } else {
      // Не сет! Штрафуем игрока
      alert("Это не SET");
      db.ref(`rooms/${currentRoomId}/players/${nickname}/score`).transaction(s => (s || 0) - 1);
    }

    return gameData; // Возвращаем обновленные данные игры

  }, (error, committed, snapshot) => {
    if (error) {
      console.error("Transaction failed abnormally!", error);
    } else if (!committed) {
      // Транзакция была отменена (другой игрок успел раньше)
      console.log("Set was already claimed by another player.");
      alert("Кто-то уже забрал этот сет!");
    }
    // После завершения транзакции (успех, провал или отмена) перерисовываем доску
    db.ref(`rooms/${currentRoomId}/game/cards`).once("value", s => drawBoard(s.val()));
  });
}

function endGame() {
  if (confirm("Завершить игру и удалить комнату?"))
    db.ref(`rooms/${currentRoomId}`).remove().then(showLobby);
}

/******************* Rendering ********************/
/* Updated drawBoard function to handle Firebase lists as objects */
function drawBoard(cardsData) {
  const board = document.getElementById("board");
  board.innerHTML = "";

  // Convert Firebase data (object) to array if needed
  const cards = Array.isArray(cardsData)
    ? cardsData
    : cardsData && typeof cardsData === 'object'
      ? Object.values(cardsData)
      : [];

  console.log("Rendering board with", cards.length, "cards");

  // Update info bar
  document.getElementById("room-code-display").innerText = `Код комнаты: ${currentRoomId}`;
  document.getElementById("sets-count").innerText        = `Возможных SET-ов: ${countSets(cards)}`;

  // Render each card
  cards.forEach((card, idx) => {
    const div = document.createElement("div");
    div.className = "card";
    if (selected.includes(idx)) div.classList.add("selected");
    div.onclick = () => selectCard(idx);

    const [color, shape, fill, count] = card;
    const colTxt = COLORS[color];

    for (let n = 0; n < count; n++) {
      const el = document.createElement("div");
      el.className = "symbol";
      el.innerHTML = getSVG(shape, fill, colTxt);
      div.appendChild(el);
    }

    board.appendChild(div);
    console.log(`Card ${idx} appended to board.`);
  });
}

/******************* Helpers ********************/
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}}
function countSets(c){
  let n=c.length,res=0;if(n<3)return 0;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++){
    if([0,1,2,3].every(p=>{const s=new Set([c[i][p],c[j][p],c[k][p]]);return s.size===1||s.size===3}))res++;
  }return res;
}

/* SVG-генератор: shape 0=овал, 1=ромб, 2=волна; fill 0=пустой, 1=штрих, 2=заливка */
function getSVG(shape, fill, color) {
  const pid = `pat-${color}-${Math.random().toString(36).slice(2)}`,
        fillAttr = {0:"none",1:`url(#${pid})`,2:color}[fill],
        stroke = color, pat = `<pattern id="${pid}" width="4" height="4" patternUnits="userSpaceOnUse">
    <path d="M0 0 l4 4" stroke="${color}" stroke-width="1"/></pattern>`;
  const wrap = (body) => `<svg viewBox="0 0 100 50"><defs>${fill===1?pat:""}</defs>${body}</svg>`;
  if (shape===0) return wrap(`<ellipse cx="50" cy="25" rx="40" ry="15" fill="${fillAttr}" stroke="${stroke}" stroke-width="3"/>`);
  if (shape===1) return wrap(`<polygon points="50,5 95,25 50,45 5,25" fill="${fillAttr}" stroke="${stroke}" stroke-width="3"/>`);
  if (shape===2) return wrap(`<path d="M10 35 Q25 15 40 35 Q55 15 70 35 Q85 15 90 35 L90 45 Q85 45 70 45 Q55 45 40 45 Q25 45 10 45 Z"
                      fill="${fillAttr}" stroke="${stroke}" stroke-width="3"/>`);
  return "";
}
