function saveResult(result) {
  if (window.saveFirebaseResult) {
    return window.saveFirebaseResult(result);
  }
  return Promise.resolve();
}

const LEVELS = Array.from({ length: 8 }, (_, index) => {
  const level = index + 1;
  return {
    level,
    size: 11 + index * 2,
    extraOpenings: Math.max(2, 12 - index),
    hintLength: Math.max(4, 12 - index),
    sight: Math.max(4, 8 - Math.floor(index / 2))
  };
});

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

const state = {
  levelIndex: 0,
  mode: "duel",
  seed: Date.now(),
  hint: false,
  winner: null,
  mazes: [],
  players: [],
  startTime: Date.now()
};

const boards = document.getElementById("boards");
const levels = document.getElementById("levels");
const stageLabel = document.getElementById("stageLabel");
const sizeLabel = document.getElementById("sizeLabel");
const hintLabel = document.getElementById("hintLabel");
const modeLabel = document.getElementById("modeLabel");
const victory = document.getElementById("victory");
const victoryText = document.getElementById("victoryText");
const nextBtn = document.getElementById("nextBtn");
const soloBtn = document.getElementById("soloBtn");
const duelBtn = document.getElementById("duelBtn");
const hintBtn = document.getElementById("hintBtn");

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function makeMaze(config, seed) {
  const random = mulberry32(seed);
  const grid = Array.from({ length: config.size }, () => Array.from({ length: config.size }, () => 1));

  function carve(x, y) {
    grid[y][x] = 0;
    for (const [dx, dy] of shuffle(DIRS, random)) {
      const nx = x + dx * 2;
      const ny = y + dy * 2;
      if (ny <= 0 || ny >= config.size - 1 || nx <= 0 || nx >= config.size - 1 || grid[ny][nx] === 0) {
        continue;
      }
      grid[y + dy][x + dx] = 0;
      carve(nx, ny);
    }
  }

  carve(1, 1);

  for (let i = 0; i < config.extraOpenings; i += 1) {
    const x = 1 + Math.floor(random() * (config.size - 2));
    const y = 1 + Math.floor(random() * (config.size - 2));
    if (x % 2 === 0 || y % 2 === 0) grid[y][x] = 0;
  }

  const start = { x: 1, y: 1 };
  const goal = { x: config.size - 2, y: config.size - 2 };
  grid[start.y][start.x] = 0;
  grid[goal.y][goal.x] = 0;
  return { grid, start, goal };
}

function shortestPath(grid, start, goal) {
  const key = (p) => `${p.x},${p.y}`;
  const queue = [start];
  const seen = new Set([key(start)]);
  const parent = new Map();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goal.x && current.y === goal.y) break;

    for (const [dx, dy] of DIRS) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = key(next);
      if (grid[next.y]?.[next.x] !== 0 || seen.has(nextKey)) continue;
      seen.add(nextKey);
      parent.set(nextKey, current);
      queue.push(next);
    }
  }

  const path = [];
  let cursor = goal;
  while (cursor) {
    path.push(cursor);
    if (cursor.x === start.x && cursor.y === start.y) break;
    cursor = parent.get(key(cursor));
  }
  return path.reverse();
}

function pathIndex(path, player) {
  const index = path.findIndex((point) => point.x === player.x && point.y === player.y);
  return index >= 0 ? index : 0;
}

function setupLevelButtons() {
  levels.innerHTML = "";
  LEVELS.forEach((level, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = level.level;
    button.addEventListener("click", () => {
      state.levelIndex = index;
      restart();
    });
    levels.append(button);
  });
}

function restart() {
  const config = LEVELS[state.levelIndex];
  state.seed = Date.now() + state.levelIndex;
  state.mazes = [
    makeMaze(config, state.seed + config.level * 101),
    makeMaze(config, state.seed + config.level * 101 + 37)
  ];
  state.players = state.mazes.map((maze) => ({ ...maze.start }));
  state.winner = null;
  state.hint = false;
  state.startTime = Date.now();
  victory.classList.add("hidden");
  render();
}

function render() {
  const config = LEVELS[state.levelIndex];
  stageLabel.textContent = `Stage ${config.level}`;
  sizeLabel.textContent = `${config.size} x ${config.size}`;
  hintLabel.textContent = state.hint ? "Hint active" : "Hint hidden";
  modeLabel.textContent = state.mode === "duel" ? "2P race" : "1P solo";
  soloBtn.classList.toggle("selected", state.mode === "solo");
  duelBtn.classList.toggle("selected", state.mode === "duel");
  hintBtn.classList.toggle("selected", state.hint);
  nextBtn.disabled = state.levelIndex === LEVELS.length - 1;

  [...levels.children].forEach((button, index) => {
    button.classList.toggle("selected", index === state.levelIndex);
  });

  boards.className = `boards ${state.mode}`;
  boards.innerHTML = "";
  const visibleBoards = state.mode === "duel" ? [0, 1] : [0];
  visibleBoards.forEach((index) => boards.append(createBoard(index, config)));
}

function createBoard(index, config) {
  const maze = state.mazes[index];
  const player = state.players[index];
  const fullPath = shortestPath(maze.grid, player, maze.goal);
  const hintStart = pathIndex(fullPath, player);
  const hintPath = state.hint ? fullPath.slice(hintStart, hintStart + config.hintLength) : [];
  const hintSet = new Set(hintPath.map((point) => `${point.x},${point.y}`));

  const panel = document.createElement("section");
  panel.className = "maze-panel";
  panel.innerHTML = `
    <div class="panel-top">
      <span>${index === 0 ? "Player 1 / WASD" : "Player 2 / Arrows"}</span>
      <span class="flag">⚑</span>
    </div>
  `;

  const mazeElement = document.createElement("div");
  mazeElement.className = "maze";
  mazeElement.style.setProperty("--maze-size", maze.grid.length);

  maze.grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      const div = document.createElement("div");
      const distance = Math.abs(player.x - x) + Math.abs(player.y - y);
      div.className = [
        "cell",
        cell ? "wall" : "road",
        maze.goal.x === x && maze.goal.y === y ? "goal" : "",
        hintSet.has(`${x},${y}`) ? "hint" : "",
        distance > config.sight ? "fog" : ""
      ].join(" ");

      if (player.x === x && player.y === y) {
        const marker = document.createElement("span");
        marker.className = "player";
        marker.style.background = index === 0 ? "#f15a3b" : "#2878ff";
        div.append(marker);
      }

      mazeElement.append(div);
    });
  });

  panel.append(mazeElement);
  return panel;
}

function finish(playerIndex) {
  const message = state.mode === "duel" ? `Player ${playerIndex + 1}, victory!` : "Victory!";
  state.winner = message;
  victoryText.textContent = message;
  victory.classList.remove("hidden");
  saveResult({
    level: LEVELS[state.levelIndex].level,
    mode: state.mode,
    winner: playerIndex + 1,
    elapsedMs: Date.now() - state.startTime
  }).catch(() => {});
}

function movePlayer(playerIndex, dx, dy) {
  if (state.winner || (state.mode === "solo" && playerIndex === 1)) return;
  const maze = state.mazes[playerIndex];
  const current = state.players[playerIndex];
  const next = { x: current.x + dx, y: current.y + dy };
  if (maze.grid[next.y]?.[next.x] !== 0) return;
  state.players[playerIndex] = next;
  if (next.x === maze.goal.x && next.y === maze.goal.y) {
    finish(playerIndex);
  }
  render();
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const controls = {
    w: [0, -1, 0],
    a: [-1, 0, 0],
    s: [0, 1, 0],
    d: [1, 0, 0],
    arrowup: [0, -1, 1],
    arrowleft: [-1, 0, 1],
    arrowdown: [0, 1, 1],
    arrowright: [1, 0, 1]
  };
  const move = controls[key];
  if (!move) return;
  event.preventDefault();
  movePlayer(move[2], move[0], move[1]);
});

document.getElementById("resetBtn").addEventListener("click", restart);
document.getElementById("replayBtn").addEventListener("click", restart);
document.getElementById("nextBtn").addEventListener("click", () => {
  state.levelIndex = Math.min(state.levelIndex + 1, LEVELS.length - 1);
  restart();
});
hintBtn.addEventListener("click", () => {
  state.hint = !state.hint;
  render();
});
soloBtn.addEventListener("click", () => {
  state.mode = "solo";
  render();
});
duelBtn.addEventListener("click", () => {
  state.mode = "duel";
  render();
});

setupLevelButtons();
restart();
