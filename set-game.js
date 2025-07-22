<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SET Multiplayer — Telegram Web App</title>

  <!-- Telegram Web App SDK -->
  <script src="https://telegram.org/js/telegram-web-app.js"></script>

  <style>
    /* === Reset & full‑viewport canvas === */
    html,body{margin:0;padding:0;height:100%;overflow:hidden;font-family:sans-serif;background:#fff;}
    #app{display:flex;flex-direction:column;height:100%;}

    /* Спрячем все тильдовские блоки, кроме embed‑блока T123 */
    #allrecords .t-record:not(.t123){display:none!important;}
    /* Убираем заглушку «Html code will be here» и платный футер */
    .t123__html,#tildacopy{display:none!important;}

    /* Панель игроков */
    #players{font-size:18px;margin:8px 0;}

    /* Кнопки управления */
    #controls{display:flex;justify-content:center;gap:16px;margin:8px 0;}
    #controls button{padding:10px 24px;font-size:16px;border:2px solid #333;border-radius:6px;background:#fff;cursor:pointer;}
    #controls button:hover{background:#f0f0f0;}

    /* Игровое поле: респонсивная сетка + скролл */
    #board{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;padding:10px;box-sizing:border-box;justify-content:center;}

    /* Карта */
    .card{width:100px;height:120px;display:flex;flex-direction:column;justify-content:center;align-items:center;border:2px solid #333;border-radius:8px;background:#fff;cursor:pointer;}
    .selected{background:#ccffcc;}
    .symbol{width:60px;height:30px;margin:2px auto;display:flex;justify-content:center;align-items:center;}
    svg{width:100%;height:100%;}
  </style>
</head>
<body>
  <div id="app">
    <!-- Блок логина остаётся для отладки в обычном браузере -->
    <div id="login">
      <h2>Введите имя:</h2>
      <input type="text" id="nickname" placeholder="Ваш ник" />
      <button onclick="joinGame()">Играть</button>
    </div>

    <div id="game" style="display:none">
      <div id="players"></div>
      <div id="controls">
        <button onclick="newGame()">Новая игра</button>
        <button onclick="addMoreCards()">Добавить карты</button>
      </div>
      <div id="board"></div>
    </div>
  </div>

  <!-- Firebase SDK (v8) -->
  <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-database.js"></script>

  <script>
    /* === Firebase CONFIG: замените на свой === */
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

    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const db=firebase.database();

    /* === Глобальное состояние === */
    let nickname="";
    let selected=[];
    let availableCards=[];
    const COLORS=["red","green","purple"];

    /* === Telegram интеграция === */
    document.addEventListener("DOMContentLoaded",()=>{
      // Если открыто внутри Telegram — используем данные пользователя
      if(window.Telegram?.WebApp?.initData){
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
        const u=Telegram.WebApp.initDataUnsafe?.user||{};
        nickname=u.username||`${u.first_name||"user"}_${u.id||Math.floor(Math.random()*1e6)}`;
        joinGame();
      }else{
        // в обычном браузере показываем форму логина
        document.getElementById("login").style.display="block";
      }
    });

    /* === Игровые функции: без изменений === */
    function joinGame(){
      if(!nickname){
        nickname=document.getElementById("nickname").value.trim();
        if(!nickname) return alert("Введите имя");
      }
      document.getElementById("login").style.display="none";
      document.getElementById("game").style.display="block";

      db.ref("players/"+nickname).set({score:0});

      db.ref("game/cards").once("value",snap=>{if(!snap.exists()) initializeGame();});
      db.ref("game/cards").on("value",snap=>{drawBoard(snap.val()||[]);});
      db.ref("players").on("value",snap=>{
        const players=snap.val()||{};
        document.getElementById("players").innerHTML=
          Object.entries(players).map(([name,{score=0}])=>`<span>${name}: ${score}</span>`).join("&nbsp;&nbsp;");
      });
    }

    function initializeGame(){
      db.ref("players").remove();
      availableCards=[];
      for(let c=0;c<3;c++)for(let s=0;s<3;s++)for(let f=0;f<3;f++)for(let n=1;n<=3;n++) availableCards.push([c,s,f,n]);
      shuffle(availableCards);
      const initial=availableCards.splice(0,12);
      db.ref("game/cards").set(initial);
      db.ref("game/availableCards").set(availableCards);
      selected=[];
    }

    function newGame(){if(confirm("Начать новую игру?")) initializeGame();}

    function addMoreCards(){
      db.ref("game").once("value",snap=>{
        const g=snap.val()||{};const cards=g.cards||[];const avail=g.availableCards||[];
        if(avail.length>=3){const newC=avail.splice(0,3);db.ref("game/cards").set([...cards,...newC]);db.ref("game/availableCards").set(avail);}else alert("Нет больше карт!");
      });
    }

    function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}

    function drawBoard(cards){
      const board=document.getElementById("board");
      board.innerHTML="";
      cards.forEach((card,idx)=>{
        const div=document.createElement("div");div.className="card";if(selected.includes(idx))div.classList.add("selected");div.onclick=()=>selectCard(idx);
        const [color,shape,fill,count]=card;const colorText=COLORS[color];
        for(let n=0;n<count;n++){const el=document.createElement("div");el.className="symbol";el.innerHTML=getSVG(shape,fill,colorText);div.appendChild(el);}board.appendChild(div);
      });
    }

    function getSVG(shape,fill,color){
      const pId=`stripes-${color}-${Math.random().toString(36).substr(2,9)}`;
      const fillType={0:"none",1:`url(#${pId})`,2:color}[fill];
      const stroke=color;
      if(shape===0) return `<svg viewBox='0 0 100 50'><defs><pattern id='${pId}' patternUnits='userSpaceOnUse' width='4' height='4'><path d='M0,0 l4,4' stroke='${color}' stroke-width='1'/></pattern></defs><ellipse cx='50' cy='25' rx='40' ry='15' fill='${fillType}' stroke='${stroke}' stroke-width='3'/></svg>`;
      if(shape===1) return `<svg viewBox='0 0 100 50'><defs><pattern id='${pId}' patternUnits='userSpaceOnUse' width='4' height='4'><path d='M0,0 l4,4' stroke='${color}' stroke-width='1'/></pattern></defs><polygon points='50,5 95,25 50,45 5,25' fill='${fillType}' stroke='${stroke}' stroke-width='3'/></svg>`;
      if(shape===2) return `<svg viewBox='0 0 100 50'><defs><pattern id='${pId}' patternUnits='userSpaceOnUse' width='4' height='4'><path d='M0,0 l4,4' stroke='${color}' stroke-width='1'/></pattern></defs><path d='M10 35 Q25 15 40 35 Q55 15 70 35 Q85 15 90 35 L90 45 Q85 45 70 45 Q55 45 40 45 Q25 45 10 45 Z' fill='${fillType}' stroke='${stroke}' stroke-width='3'/></svg>`;
      return "";
    }

    function selectCard(idx){
      selected=selected.includes(idx)?selected.filter(i=>i!==idx):[...selected,idx];
      if(selected.length===3) checkSet();
      db.ref("game/cards").once("value",s=>drawBoard(s.val()));
    }

    function checkSet(){
      db.ref("game").once("value",snap=>{
        const g=snap.val()||{};const cards=g.cards||[];const avail=g.availableCards||[];
        const [a,b,c]=selected.map(i=>cards[i]);
        const ok=[0,1,2,3].every(i=>{const s=new Set([a[i],b[i],c[i]]);return s.size===1||s.size===3;});
        if(ok){let newCards=[...cards];selected.sort((x,y)=>y-x).forEach(i=>newCards.splice(i,1));
          if(newCards.length<12&&avail.length>=3){newCards=[...newCards,...avail.splice(0,3)];db.ref("game/available
