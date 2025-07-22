/* ===== SET Multiplayer (room-based) for Telegram Web App =====
   Итоговый исправленный код:
   - Создаёт комнату по коду, если та не существует
   - joinRoomByCode() завершена корректно
   - initializeGame() больше не удаляет игроков, а обнуляет счёт
   - initializeGame() вызывается до записи хоста, чтобы он не стирал сам себя
*/

/******************* Firebase CONFIG ********************/
const firebaseConfig = {
  apiKey: "AIzaSyD5X8yyI8CzxDdlenFLS13QOFKU3CevQrs",
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
let nickname      = "";
let currentRoomId = null;
let selected      = [];
const COLORS      = ["red", "green", "purple"];

/******************* Telegram / URL bootstrap ********************/
document.addEventListener("DOMContentLoaded", () => {
  const tg = window.Telegram?.WebApp;

  showLobby(); // базово открываем лобби

  if (tg && tg.initDataUnsafe?.user) {
    tg.ready();
    tg.expand();
    const u = tg.initDataUnsafe.user;
    nickname = u.username || `${u.first_name || "user"}_${u.id}`;
  }

  const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get("room");
  loginUser(startParam);
});

/******************* Auth flows ********************/
function manualLogin() {
  nickname = document.getElementById("nickname")?.value.trim();
  if (!nickname) { alert("Введите имя"); return; }
  loginUser();
}

async function loginUser(roomIdFromLink = null) {
  const snap = await db.ref(`playerSessions/${nickname}`).once("value");
  const prevRoom = snap.val();
  if (prevRoom) db.ref(`playerSessions/${nickname}`).remove();

  if (roomIdFromLink) {
    const exists = (await db.ref(`rooms/${roomIdFromLink}`).once("value")).exists();
    joinRoom(roomIdFromLink, !exists);
    return;
  }

  showLobby();
}

function showLobby() {
  ["login","game"].forEach(id => document.getElementById(id).style.display = "none");
  document.getElementById("lobby").style.display = "block";
}

/******************* Lobby actions ********************/
async function createNewRoom() {
  let code, attempts = 0;
  do {
    code = Math.floor(100000 + Math.random()*900000).toString();
  } while ((await db.ref(`rooms/${code}`).once("value")).exists() && ++attempts < 10);
  if (attempts === 10) return alert("Не удалось создать комнату, попробуйте ещё");
  joinRoom(code, true);
}

async function joinRoomByCode() {
  const code = document.getElementById("room-code-input")?.value.trim();
  if (!/^\d{6}$/.test(code)) return alert("Введите корректный 6-значный код");
  const roomExists = (await db.ref(`rooms/${code}`).once("value")).exists();
  joinRoom(code, !roomExists);
}

/******************* Core room handshake ********************/
async function joinRoom(roomId, isHost = false) {
  currentRoomId = roomId;

  document.getElementById("login").style.display = "none";
  document.getElementById("lobby").style.display = "none";
  document.getElementById("game").style.display  = "block";

  const linkElement = document.getElementById("invite-link");
  if (linkElement) {
    const bot  = Telegram?.WebApp?.initDataUnsafe?.bot_username || "setboardgame_bot";
    const link = `https://t.me/${bot}/setgame?startapp=${currentRoomId}`;
    linkElement.href      = link;
    linkElement.innerText = `Пригласить: ${link}`;
    linkElement.onclick   = async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(link);
        Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
        alert("Ссылка на комнату скопирована в буфер обмена!");
      } catch (err) {
        console.error("Failed to copy link: ", err);
        alert("Не удалось скопировать ссылку. Ссылка: " + link);
      }
    };
    linkElement.style.display = "block";
  }

  if (isHost) await initializeGame();

  db.ref(`rooms/${roomId}/players/${nickname}`).set({ score: 0 });
  db.ref(`playerSessions/${nickname}`).set(roomId);

  db.ref(`rooms/${roomId}/game/cards`).on("value", snap => drawBoard(snap.val() || []));
  db.ref(`rooms/${roomId}/players`).on("value", snap => {
    const list = Object.entries(snap.val() || {})
      .map(([n,{score=0}]) => `${n}: ${score}`).join("  ");
    document.getElementById("players").innerHTML = list;
  });
}

/******************* Game lifecycle ********************/
async function initializeGame() {
  const plSnap = await db.ref(`rooms/${currentRoomId}/players`).once("value");
  const players = plSnap.val() || {};
  const updates = {};
  Object.keys(players).forEach(n => updates[`${n}/score`] = 0);
  if (Object.keys(updates).length)
    await db.ref(`rooms/${currentRoomId}/players`).update(updates);

  const deck = [];
  for (let c=0;c<3;c++) for (let s=0;s<3;s++)
    for (let f=0;f<3;f++) for (let n=1;n<=3;n++) deck.push([c,s,f,n]);
  shuffle(deck);

  await db.ref(`rooms/${currentRoomId}/game`).set({
    cards          : deck.splice(0,12),
    availableCards : deck
  });
  selected = [];
}

/******************* Остальной код не менялся ********************/
// ... остаётся без изменений