const board = document.getElementById('board');
const statusB = document.getElementById('status');
const scoreB = document.getElementById('score_black');
const scoreW = document.getElementById('score_white');
const currentPlayerBlack = document.getElementById('c_black');
const currentPlayerWhite = document.getElementById('c_white');
const moveListElement = document.getElementById('move-list');
const copyUrlBtn = document.getElementById("copy-url-btn");

const startMatchBtn = document.getElementById("start-match");
const overlay = document.getElementById("game-settings-overlay");

const surrenderBtn = document.getElementById('surrender-btn');

//音関係----
const warningSound = document.getElementById('warningSound');
const victorySound = document.getElementById('victorySound');
const defeatSound = document.getElementById('defeatSound');
const playerJoin = document.getElementById('playerJoin');
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let placeStoneBuffer = null;
let lastPlayTime = 0;
let gainNode = audioContext.createGain(); // 音量調整用ノード
gainNode.connect(audioContext.destination); // 出力先に接続
gainNode.gain.value = 0.09;

let resumed = null;
let onlineGameStarted = false;

let deferredPrompt;


// プレイヤーの一意なIDを取得・保存（なければ新規作成）
let playerId = localStorage.getItem("playerId");
if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem("playerId", playerId);
}
// プレイヤー名を取得・保存（なければ新規作成）
let playerName = localStorage.getItem("playerName");
if (!playerName) {
    playerName = "player" + Math.floor(Math.random() * 1000); // デフォルトの名前を設定
    localStorage.setItem("playerName", playerName);
}

const gUrlParams = new URLSearchParams(window.location.search);
let gameRoom = gUrlParams.get('room');
const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";

let socket = null;

// 設定関係
let soundEffects = !(localStorage.getItem('soundEffects') === "false");
let timeLimitSoundEnabled = !(localStorage.getItem('timeLimitSoundEnabled') === "false");
let gameEndSoundEnabled = localStorage.getItem('gameEndSoundEnabled') === "true";
let playerJoinSoundEnabled = !(localStorage.getItem('playerJoinSoundEnabled') === "false");

let showValidMoves = !(localStorage.getItem('showValidMoves') === "false");
let timeLimit = parseInt(localStorage.getItem('timeLimit') || 0);
let aiLevel = parseInt(localStorage.getItem('aiLevel') || 1);

let currentPlayer = 'black';
let gameBoard = Array.from({ length: 8 }, () => Array(8).fill(''));
let moveHistory = [];
let currentMoveIndex = -1; // Track the current move index
let lastMoveCell = null;

let gameFinishedCount = parseInt(localStorage.getItem('gameFinishedCount') || 0);

let minimax_depth = aiLevel - 2;

let currentPlayerTimer;

let gameEnded = false;
let share_winner = "";

//言語設定
let langCode = "ja";
let gameMode = window.location.pathname.split('/').filter(Boolean)[0] || 'player';
if (gameMode === "en") {
    gameMode = window.location.pathname.split('/').filter(Boolean)[1] || 'player';
    langCode = "en";
}


let aimove = false;

let online = false;
let role_online = "unknown";

function refreshBoard() {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 8; i++) {
        const rowElement = document.createElement('div');
        rowElement.className = 'row';
        rowElement.setAttribute('role', 'row'); // ARIA対応

        for (let j = 0; j < 8; j++) {
            gameBoard[i][j] = '';
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.setAttribute('aria-label', `abcdefgh`[j] + `${i + 1}：空`);
            cell.setAttribute('role', 'gridcell');

            rowElement.appendChild(cell);
        }
        fragment.appendChild(rowElement);
    }
    board.appendChild(fragment);
}

// `Event Delegation` を使って、`board` にイベントを一括設定
board.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;

    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);
    makeMove(row, col);
});

function initializeBoard() {
    refreshBoard();

    if (!loadBoardFromURL()) {
        setInitialStones();

    }
    add4x4Markers();
    updateStatus();

}
function setInitialStones() {
    setDisc(3, 3, 'white');
    setDisc(3, 4, 'black');
    setDisc(4, 3, 'black');
    setDisc(4, 4, 'white');
    // Add initial setup to move history

}

// 盤面に黒ポチを追加
function add4x4Markers() {
    const markers = [
        { row: 1, col: 1 },
        { row: 1, col: 5 },
        { row: 5, col: 1 },
        { row: 5, col: 5 }
    ];

    markers.forEach(({ row, col }) => {
        const cell = board.children[row].children[col];
        const marker = document.createElement('div');
        marker.className = 'marker';
        cell.classList.add('44');
        cell.appendChild(marker);
    });
}

function setDisc(row, col, color) {

    gameBoard[row][col] = color;
    const cell = board.children[row].children[col];
    if (cell.classList.contains('44')) {
        cell.innerHTML = `<div class="disc 44 ${color}"></div><div class="marker"></div>`;
    } else {
        cell.innerHTML = `<div class="disc ${color}"></div>`;
    }
    cell.setAttribute('aria-label', "abcdefgh"[col] + `${row + 1}：${color === 'black' ? lang.black : lang.white}`);
}

function notifyNoValidMoves(player) {
    if (online) {
        if (role_online === player) {
            alert(lang.you_pass);
            return;
        } else {
            alert(lang.opponent_pass);
            return;
        }
    }
    if (player === 'black') {
        alert(lang.notify_b);
    } else {
        alert(lang.notify_w);
    }
}

//盤面がすべて埋まっているかのチェック
function isBoardFull() {
    return gameBoard.flat().every(cell => cell !== '');
}
//サーバーからの手とは限らないので注意
async function applyServerMove(row, col, player, status, final = false) {
    // statusが0の場合は、サーバーからの手?か友達対戦です
    // statusが1の場合は、リプレイ時の手
    // statusが2の場合は、これはAIendMoveによる手であり、serverからの手ではないです
    //console.log(`[applyServerMove] row: ${row}, col: ${col}, player: ${player}, status: ${status}, currentPlayer: ${currentPlayer}`);
    if (gameBoard[row][col] !== '' || !isValidMove(row, col, player)) {
        console.error(`[applyServerMove] Invalid move: (${row},${col}), gameBoard[${row}][${col}]: ${gameBoard[row][col]}, isValidMove: ${isValidMove(row, col, player)}`);
        return;
    }
    // 以前のハイライトを削除
    if (lastMoveCell) {
        lastMoveCell.classList.remove('last-move');
    }

    setDisc(row, col, player);

    if (soundEffects) {
        if (status !== 1) {
            await playStoneSound();
        } else if (final) {
            console.log("[applyServerMove]final" + final);
            playStoneSound();
        }

    }
    // 現在の手にハイライトを追加
    const currentCell = board.children[row].children[col];
    currentCell.firstChild.classList.add('last-move');
    lastMoveCell = currentCell.firstChild;

    // 石をひっくり返す
    flipDiscs(row, col, player);

    recordMove(row, col, status);

    if (!online && isBoardFull()) {
        endGame("offline");
    } else {

        // 手番を変更
        currentPlayer = (player === 'black') ? 'white' : 'black';

        if (!hasValidMove(currentPlayer)) {

            if (online) {
                if (role_online === currentPlayer && final === 1) {
                    socket.send(JSON.stringify({ action: "pass" }));

                }

            } else {
                if (status === 0) {
                    notifyNoValidMoves(currentPlayer); //友達対戦の場合のパス
                } else if (status === 1) {
                    notifyNoValidMoves(currentPlayer);
                } else if (status === 2) {
                    alert(lang.you_pass) // AIの後のパス
                }
                aimove = false;

            }

            currentPlayer = currentPlayer === 'black' ? 'white' : 'black';

            console.log(`[applyServerMove] No valid moves. SO currentP became: ${currentPlayer}`);

            if (!hasValidMove(currentPlayer)) {
                if (!online) {
                    endGame("offline");
                }

            } else {

                updateStatus();
            }
        }//↑終了：有効手がなかった場合
    }
    if (gameMode === 'ai' && currentPlayer === 'white' && !gameEnded && status !== 1 && aimove === false) {
        startAIMove();

    } else {
        if (final !== false || gameMode !== online) {
            updateURL();
        }
    }


    if ((final !== false || gameMode !== online)) {
        updateStatus();
    }
}

function startAIMove() {
    aimove = true;
    stopTimer();
    // 「考え中」のログを表示
    const timerDisplay_ = document.getElementById('timer-display');

    timerDisplay_.classList.remove('warning1', 'warning2'); // 警告クラスを削除

    timerDisplay_.style.display = 'inline-block'; // 表示
    timerDisplay_.textContent = lang.thinking;
    board.classList.add('thinking');


    setTimeout(() => {
        updateStatus();
        aiMakeMove();
        updateURL();
    }, 10);
}

function makeMove(row, col, status = 0) {

    if (gameEnded) return;

    // リプレイ時はサーバーに送信しない
    if (status === 1) {
        applyServerMove(row, col, currentPlayer, status);
        return;
    }

    if (online) {
        if (role_online === "unknown") {
            alert(lang.connecting);
            return;
        } else if (role_online === "spectator") {
            alert(lang.spec_cant_play);
            return;
        } else if (role_online === currentPlayer) {
            sendMove(row, col);
        } else {
            const roleDisplay = role_online === "black" ? lang.black : role_online === "white" ? lang.white : lang.spec;
            alert(`${lang.not_your_turn}：${currentPlayer === 'black' ? lang.black : lang.white}, ${lang.you}：${roleDisplay}`);

            return;
        }
    } else {
        applyServerMove(row, col, currentPlayer, status);
    };
}

function isValidMove(row, col, playerColor = currentPlayer) {
    if (gameBoard[row][col] !== '') {
        return false;
    }
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [dx, dy] of directions) {
        if (wouldFlip(row, col, dx, dy, playerColor)) return [row, col];
    }
    return false;
}

function wouldFlip(row, col, dx, dy, playerColor = currentPlayer) {
    let x = row + dx;
    let y = col + dy;
    if (!isValidPosition(x, y) || gameBoard[x][y] !== getOpponentColor(playerColor)) return false;
    while (isValidPosition(x, y) && gameBoard[x][y] === getOpponentColor(playerColor)) {
        x += dx;
        y += dy;
    }
    return isValidPosition(x, y) && gameBoard[x][y] === playerColor;
}

function flipDiscs(row, col, playerColor = currentPlayer) {
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];




    for (const [dx, dy] of directions) {
        if (wouldFlip(row, col, dx, dy, playerColor)) {
            let x = row + dx;
            let y = col + dy;
            let flip_count = 1;
            while (gameBoard[x][y] === getOpponentColor(playerColor)) {
                flip_count++;
                setDisc(x, y, playerColor);
                x += dx;
                y += dy;
            }
        }

    }



}

function isValidPosition(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getOpponentColor(playerColor = currentPlayer) {
    return playerColor === 'black' ? 'white' : 'black';
}


function hasValidMove(playerColor = currentPlayer) {


    const validMoves = [];
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            if (gameBoard[i][j] === '') {
                const move = isValidMove(i, j, playerColor);

                if (move) {
                    validMoves.push(move);
                }
            }
        }
    }
    return validMoves.length > 0 ? validMoves : false;
}
function highlightValidMoves() {
    removeHighlight();
    const validMoves = hasValidMove();
    if (validMoves) {
        validMoves.forEach(([row, col]) => {
            const cell = board.children[row].children[col];
            cell.classList.add('valid-move');
            if (gameMode === 'ai' && currentPlayer === 'white') {

                board.classList.add('opponent-turn');

            } else if (online && (role_online !== currentPlayer)) {
                if (gameBoard.flat().filter(cell => cell !== '').length !== 4) {
                    board.classList.add('opponent-turn');

                } else {
                    if (role_online === "white") {
                        board.classList.add('opponent-turn');
                    }
                }
            }

            // 薄いディスクを追加
            const faintDisc = document.createElement('div');
            faintDisc.className = `faint-disc faint-${currentPlayer}`;
            cell.appendChild(faintDisc);

        });
    }
}

function removeHighlight() {
    // 前のハイライトをクリア
    const previousValidMoves = document.querySelectorAll('.valid-move');
    previousValidMoves.forEach(cell => {

        const faintDisc = cell.querySelector('.faint-disc');
        if (faintDisc) {
            faintDisc.remove();
        }
        cell.classList.remove('valid-move');
        board.classList.remove('opponent-turn');
    });

}
function updateStatus() {
    const blackCount = gameBoard.flat().filter(cell => cell === 'black').length;
    const whiteCount = gameBoard.flat().filter(cell => cell === 'white').length;
    scoreB.textContent = blackCount;
    scoreW.textContent = whiteCount;

    if (currentPlayer === 'black') {
        currentPlayerBlack.style.visibility = "visible";
        currentPlayerWhite.style.visibility = "hidden";
    }
    else {
        currentPlayerBlack.style.visibility = "hidden";
        currentPlayerWhite.style.visibility = "visible";
    }

    if (showValidMoves || showValidMoves === "true") {
        highlightValidMoves();

    } else {
        removeHighlight();
    }


    if (!aimove) {
        // 制限時間表示を更新またはクリア
        const timerDisplay = document.getElementById('timer-display');


        if (timeLimit > 0) {
            timerDisplay.style.display = 'inline-block'; // 表示
            if (!gameEnded) startTimer();
        } else {
            timerDisplay.style.display = 'none'; // 非表示

            stopTimer();
        }
    }
}

function startTimer() {
    let remainingTime = timeLimit;
    const timerDisplay = document.getElementById('timer-display');
    timerDisplay.textContent = formatTime(remainingTime);

    // 既存のタイマーを停止
    stopTimer();
    warningSound.currentTime = 0;

    currentPlayerTimer = setInterval(() => {
        remainingTime--;
        timerDisplay.textContent = formatTime(remainingTime);

        if (remainingTime < 4 && timeLimitSoundEnabled) {
            warningSound.play().catch(error => {
                console.warn("audio was blocked:", error);
            });;
        }
        if (remainingTime <= 5) {
            timerDisplay.classList.remove('warning1');
            timerDisplay.classList.add('warning2');



        } else if (remainingTime <= 15) {
            timerDisplay.classList.add('warning1');
        } else {
            timerDisplay.classList.remove('warning1');
            timerDisplay.classList.remove('warning2');
        }

        if (remainingTime <= 0) {
            clearInterval(currentPlayerTimer);
            if (!online) {
                alert(lang.timeout_winner + (currentPlayer === 'black' ? lang.white : lang.black));
                endGame("offline", currentPlayer === 'black' ? 'white' : 'black'); // 時間切れになったプレイヤーの負けとしてゲームを終了
            }
        }
    }, 1000);
}
function stopTimer() {
    if (currentPlayerTimer) {
        clearInterval(currentPlayerTimer);
        currentPlayerTimer = null;

        // 警告音を停止
        warningSound.pause();


    }
}
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

function isIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent);
}


function recordMove(row, col) {

    const cols = 'abcdefgh';
    const moveNotation = `${cols[col]}${row + 1}`;

    moveHistory.push({ row, col, player: currentPlayer, moveNotation, token: "recordMove" });
    localStorage.setItem("deleted_urls", JSON.stringify([]));
    currentMoveIndex = moveHistory.length - 1;

    updateMoveList();

}

function updateMoveList() {

    const moveNotations = moveHistory.map((move, index) => {
        return `${index + 1}. ${move.player === 'black' ? '●' : '○'}${move.moveNotation}`;
    });
    moveListElement.textContent = moveNotations.join('\n');
    moveListElement.scrollTop = moveListElement.scrollHeight;
}

function launchConfetti() {
    const rect = board.getBoundingClientRect()
    const windowHeight = window.innerHeight;
    const originY = (rect.top + rect.height) / windowHeight;


    confetti({
        particleCount: 150,
        angle: 75,
        spread: 100,
        gravity: 0.2,
        origin: {
            x: 0, //  (0 = 左端、1 = 右端)
            y: originY  // (0 = 上端、1 = 下端)
        },
        colors: ['#165B33', '#BB2528', '#146B3A', '#EA4630'],
        shapes: ['square', 'circle'],
        scalar: 0.8,
        zIndex: 100
    });
    setTimeout(() => {

        confetti({
            particleCount: 150,
            angle: 105,
            spread: 100,
            gravity: 0.2,
            origin: {
                x: 1, //  (0 = 左端、1 = 右端)
                y: originY  // (0 = 上端、1 = 下端)
            },
            colors: ['#165B33', '#BB2528', '#146B3A', '#EA4630'],
            shapes: ['square', 'circle'],
            scalar: 0.8,
            zIndex: 100
        });
    }, 800);
}

function endGame(online_data, winner = null) {
    console.log(`[endGame] Game ended. Winner: ${winner}`+"gameMode:" + gameMode);
    const blackCount = gameBoard.flat().filter(cell => cell === 'black').length;
    const whiteCount = gameBoard.flat().filter(cell => cell === 'white').length;
    let result;

    gameEnded = true;
    if (winner === "won") {
        share_winner = "won";

    } else if (online_data !== "offline") {
        if (online_data.winner === role_online) {
            launchConfetti();
        }
        if (online_data.reason === "surrender") {
            share_winner = online_data.winner;
            result = lang.surrender_winner + (online_data.winner === 'black' ? lang.black : lang.white);

            if (gameEndSoundEnabled) {
                if (online_data.winner === role_online) {
                    victorySound.currentTime = 0;
                    victorySound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                } else {
                    defeatSound.currentTime = 0;

                    defeatSound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });;
                }
            }
        } else if (online_data.reason === "timeout") {
            share_winner = online_data.winner;
            result = lang.timeout_winner + (online_data.loser === 'black' ? lang.black : lang.white);
            if (gameEndSoundEnabled) {
                if (online_data.winner === role_online) {
                    victorySound.currentTime = 0;
                    victorySound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });;
                } else {
                    defeatSound.currentTime = 0;
                    defeatSound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });;
                }
            }
        } else if (online_data.reason === "natural") {
            //石の数だけで勝敗が決められる場合
            share_winner = "won";
            result = lang.winner + (online_data.winner === 'black' ? lang.black : lang.white);

            if (gameEndSoundEnabled) {
                if (online_data.winner === role_online) {
                    victorySound.currentTime = 0;
                    victorySound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });;
                } else {
                    defeatSound.currentTime = 0;
                    defeatSound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });;
                }
            }
        }


    } else if (winner) {
        // 時間切れの場合は、相手のプレイヤーの勝ち
        result = lang.timeout_winner + (winner === 'black' ? lang.white : lang.black);

        share_winner = winner; // 時間切れ勝ちなら、石の数で負けていても大丈夫なように明確に共有時に伝える必要があるので、winnerを明示する

        if (winner === "white" && gameMode === "ai") {
        }else {
            if (gameEndSoundEnabled) {
                victorySound.currentTime = 0;

                victorySound.play().catch(error => {
                    console.warn("audio was blocked:", error);
                });;
            }
            launchConfetti();

        }

    } else {
        share_winner = "won";

        if (blackCount > whiteCount) {
            result = lang.winner + lang.black;
            if (gameEndSoundEnabled) {
                victorySound.currentTime = 0;
                victorySound.play().catch(error => {
                    console.warn("audio was blocked:", error);
                });;
            }
            launchConfetti();
        } else if (whiteCount > blackCount) {
            result = lang.winner + lang.white;
            if (gameMode === "ai") {
                if (gameEndSoundEnabled) {
                    defeatSound.currentTime = 0;
                    defeatSound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                }
                
            } else {
                if (gameEndSoundEnabled) {
                    victorySound.currentTime = 0;
                    victorySound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                }
                launchConfetti();
            }

        } else {
            result = lang.draw;
            if (gameMode === "ai") {
                if (gameEndSoundEnabled){
                defeatSound.currentTime = 0;
                defeatSound.play().catch(error => {
                    console.warn("audio was blocked:", error);
                });
                }
                
            } else {
                if (gameEndSoundEnabled) {
                    victorySound.currentTime = 0;
                    victorySound.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                }
                launchConfetti();
            }
        }

    }

    url = new URL(window.location);
    url.searchParams.set('won', share_winner);
    history.pushState(null, '', url);

    statusB.textContent = `${lang.game_end} - ${result} （${lang.black} :${blackCount}, ${lang.white}: ${whiteCount}）`;

    stopTimer();
    gameFinishedCount++;
    localStorage.setItem('gameFinishedCount', gameFinishedCount);
    if (gameFinishedCount === 1 && deferredPrompt) {
        showInstallPrompt();
    } else if (gameFinishedCount === 3 && deferredPrompt) {
        showInstallPrompt();
    } else if (isIOS() && !window.navigator.standalone && gameFinishedCount === 1) {
        iOSinstallGuide();
    } else if (isIOS() && !window.navigator.standalone && gameFinishedCount === 3) {
        iOSinstallGuide();
    }
}

function serializeMoveHistory() {

    return moveHistory.map(move => `${move.player[0]}${move.row}${move.col}`).join(',');
}

function deserializeMoveHistory(serialized) {
    const moves_ = serialized.split(',');
    if (moves_[moves_.length - 1] === "") {
        moves_.pop();
    }
    moveHistory = [];
    moveHistory = moves_.map(a_move => {

        const row = parseInt(a_move[1]);
        const col = parseInt(a_move[2]);
        const player = a_move[0] === 'b' ? 'black' : 'white';

        return { row, col, player, moveNotation: `${'abcdefgh'[col]}${row + 1}`, token: "deserialize" };
    }
    );




}

function updateURL() {
    const serializedMoves = serializeMoveHistory();
    const url = new URL(window.location);
    let newPath = `/${gameMode}/`;
    if (gameMode === "player") {
        newPath = `/`;
    }

    if (window.location.pathname.split('/').filter(Boolean)[0] === "en") {
        newPath = "en" + newPath;
    }


    url.pathname = newPath;
    url.searchParams.set('moves', serializedMoves);
    url.searchParams.set('timeLimit', timeLimit);
    url.searchParams.set('showValidMoves', showValidMoves);
    url.searchParams.set('aiLevel', aiLevel);
    history.pushState(null, '', url);
}

function loadBoardFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const serializedMoves = urlParams.get('moves');
    const timeLimitFromURL = urlParams.get('timeLimit');
    const showValidMovesFromURL = urlParams.get('showValidMoves');
    const pathParts = window.location.pathname.split('/').filter(Boolean);

    let modeFromPath = pathParts[0] || 'player';


    if (pathParts[0] === "en") {
        modeFromPath = pathParts[1] || 'player';
    }

    const won = urlParams.get('won');
    const aiLevelFromURL = urlParams.get('aiLevel');


    if (won === "won") {
        timeLimit = 0;
        stopTimer();
    }


    if (modeFromPath) {
        gameMode = modeFromPath;
        localStorage.setItem('gameMode', gameMode);
        document.querySelectorAll('.mode-btn').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.mode === gameMode) {
                el.classList.add('active');
            }
        });


        if (gameMode === "ai") {
            document.getElementById('level_ai').style.display = 'block';

        } else {
            document.getElementById('level_ai').style.display = 'none';
        }
        if (gameMode === "online") {
            console.log(`timelimit: ${timeLimit}`);
            makeSocket()
            online = true;
            onlineUI();
            document.getElementById("playerJoinSoundBox").style.display = "block";
        } else {
            if (timeLimitFromURL) {
                timeLimit = parseInt(timeLimitFromURL);
                if (timeLimit === 0) {
                    document.getElementById("timeLimitBox_").style.display = "none";
                } else {
                    document.getElementById("timeLimitBox_").style.display = "block";
                }
            };
            if (aiLevelFromURL) {
                aiLevel = parseInt(aiLevelFromURL);
            };
            if (showValidMovesFromURL) {
                showValidMoves = showValidMovesFromURL === 'true';
            };
            const url = new URL(window.location);
            url.searchParams.delete("room");
            history.pushState(null, "", url);
            online = false;
            if (socket) {
                socket.close();
                socket = null;
            }
            document.getElementById("playerJoinSoundBox").style.display = "none";
        }
    }

    document.getElementById('timeLimitSelect').value = timeLimit;
    document.getElementById('aiLevelSelect').value = aiLevel;
    document.getElementById('showValidMovesCheckbox').checked = showValidMoves ? true : false;

    updateStatus();

    if (serializedMoves) {
        if (gameMode !== "online") {
            deserializeMoveHistory(serializedMoves);

            replayMovesUpToIndex(moveHistory.length - 1);
            if (won) {
                endGame("offline", won);
                timeLimit = 0;
            }
        }
        return true;
    } else {

        return false;

    }
}


function copyURLToClipboard(matchRoom = false) {
    const url = new URL(window.location);
    let alertText = lang.copy_url;
    if (online) {
        if (onlineGameStarted) {
            alertText = lang.copy_spec;
        } else {
            alertText = lang.copy_invite;
        }
    } else {
    }
    if (!matchRoom) {
        url.searchParams.set('won', share_winner);
    }
    navigator.clipboard.writeText(url.toString()).then(() => {
        alert(alertText);
    }).catch(err => {
        alert(lang.copy_failed);
        console.error('Failed to copy URL: ', err);
    });
}

function restart() {
    if (online) {

        timeLimit = 0;
        localStorage.setItem('timeLimit', timeLimit);




        // 新しい部屋を生成
        // 新しい部屋IDをランダムに生成（UUID の代わりに短いランダム文字列）
        const newRoomId = Math.random().toString(36).substring(2, 8);

        let newUrl = `${window.location.origin}/online/?room=${newRoomId}`;


        if (window.location.pathname.split('/').filter(Boolean)[0] === "en") {
            newUrl = `${window.location.origin}/en/online/?room=${newRoomId}`;

        }


        console.log(`[restart] New room URL: ${newUrl}`);
        window.location.href = newUrl; // 新しい部屋へ遷移


    } else {
        let newUrl = `${window.location.origin}/${gameMode}/`;

        if (window.location.pathname.split('/').filter(Boolean)[0] === "en") {
            newUrl = `${window.location.origin}/en/${gameMode}/`;
        }

        localStorage.setItem('deleted_urls', JSON.stringify([]));
        window.location.href = newUrl;


    }
}

function goToPreviousMove() {
    //change URL params
    const url = new URL(window.location);
    const move_now = url.searchParams.get('moves');
    if (move_now.length > 3) {
        url.searchParams.set('moves', move_now.slice(0, move_now.lastIndexOf(',')));

    } else {
        url.searchParams.delete('moves');
    }
    if (localStorage.getItem('deleted_urls') === null) {
        localStorage.setItem('deleted_urls', JSON.stringify([move_now.slice(move_now.lastIndexOf(',') + 1)]));
    } else {
        let deleted_urls = JSON.parse(localStorage.getItem('deleted_urls'));
        deleted_urls.push(move_now.slice(move_now.lastIndexOf(',') + 1));
        localStorage.setItem('deleted_urls', JSON.stringify(deleted_urls));
    }



    window.location = url;



}

function goToNextMove() {
    //change URL params
    const url = new URL(window.location);
    const move_now = url.searchParams.get('moves') ? url.searchParams.get('moves') + ',' : '';
    const deleted_urls = JSON.parse(localStorage.getItem('deleted_urls'));

    if (deleted_urls.length > 0) {
        url.searchParams.set('moves', move_now + deleted_urls.pop());


        localStorage.setItem('deleted_urls', JSON.stringify(deleted_urls));
        window.location = url;

    } else {
        alert(lang.cant_go_more);
    }

}

function replayMovesUpToIndex(index, fromServer = false) {
    gameBoard = gameBoard.map(row => row.map(() => '')); // Clear the board
    setInitialStones();
    console.log("replayMovesUpToIndex", moveHistory);
    moveHistory.slice(0, index).forEach(({ row, col, player }) => {
        applyServerMove(row, col, player, 1);
    });
    if (index >= 0) {
        applyServerMove(moveHistory[index].row, moveHistory[index].col, moveHistory[index].player, 1, fromServer);

    }
    updateStatus();
}
// AIの手を決定する関数
function aiMakeMove() {
    const startTime = performance.now();

    let bestMove = null;
    let bestScore = -Infinity;
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    // 現在の盤面を効率的にコピー
    const initialBoard = gameBoard.map(row => [...row]);
    const validMoves = hasValidMove();
    const nofvalidMoves = validMoves.length;

    // 有効な手がない場合の早期リターン
    if (nofvalidMoves === 0) {
        endMove(null, timeLimit, gameEnded, aimove);
        return;
    }

    // 全ての有効な手を探索
    for (let i = 0; i < validMoves.length; i++) {
        const [row, col] = validMoves[i];

        // 一時的な盤面を作成して手を適用
        const tempBoard = applyMoveToBoard(initialBoard, row, col, currentPlayer, directions);

        // ミニマックス法で評価値を計算
        const score = minimax(tempBoard, minimax_depth, false, -Infinity, Infinity);

        console.log(`[aiMakeMove] Move (${row},${col}) has score: ${score}`);

        if (score > bestScore) {
            bestScore = score;
            bestMove = { row, col };
        }

        if (i === Math.floor(validMoves.length / 2)) {
            const midTime = performance.now();
            const estimatedFullTime = (midTime - startTime) * 2;

            // 動的に探索深度を調整
            adjustSearchDepth(estimatedFullTime, aiLevel);
        }
    }

    // 低難易度のAIは爆速なので、敢えて少し遅らせる。
    if (aiLevel <= 3) {
        setTimeout(() => endMove(bestMove, timeLimit, gameEnded, aimove), 800);
    } else if (aiLevel <= 5) {
        setTimeout(() => endMove(bestMove, timeLimit, gameEnded, aimove), 400);
    } else {
        endMove(bestMove, timeLimit, gameEnded, aimove);
    }
}

// 盤面に指し手を適用する関数（副作用なし）
function applyMoveToBoard(board, row, col, player, directions) {
    // ボードをディープコピー
    const newBoard = board.map(row => [...row]);
    newBoard[row][col] = player;

    // 石を裏返す
    for (const [dx, dy] of directions) {
        const flippedStones = getFlippedStones(newBoard, row, col, dx, dy, player);
        for (const [x, y] of flippedStones) {
            newBoard[x][y] = player;
        }
    }

    return newBoard;
}

// 指定方向に裏返せる石の座標を配列で返す
function getFlippedStones(board, row, col, dx, dy, player) {
    const flippedStones = [];
    let x = row + dx;
    let y = col + dy;

    const opponent = player === 'black' ? 'white' : 'black';

    while (isValidPosition(x, y) && board[x][y] === opponent) {
        flippedStones.push([x, y]);
        x += dx;
        y += dy;
    }

    // 最後に自分の石があれば、収集した石はすべて裏返せる
    if (isValidPosition(x, y) && board[x][y] === player && flippedStones.length > 0) {
        return flippedStones;
    }

    return [];
}

// 探索深度を動的に調整する関数
function adjustSearchDepth(estimatedTime, aiLevel) {
    if (estimatedTime < (aiLevel * 400)) {
        minimax_depth++;
    } else if (estimatedTime > aiLevel * 700) {
        minimax_depth--;
        if (estimatedTime > aiLevel * 1000) {
            minimax_depth--;
        }
        if (minimax_depth <  1) {
            minimax_depth = 1;
        }
    }
}

function endMove(bestMove, timeLimit, gameEnded, fromAI) {
    if (bestMove) {
        makeMove(bestMove.row, bestMove.col, 2);
    }

    // AIの思考が終了したら、ログをクリアまたは制限時間表示に戻す
    if (timeLimit > 0 && !gameEnded) {
        startTimer();
    } else {
        document.getElementById('timer-display').style.display = 'none';
    }

    if (fromAI) {
        board.classList.remove('thinking');
    }

    aimove = false;
}

// ミニマックス法（アルファベータ枝刈りあり）
function minimax(board, depth, isMaximizing, alpha = -Infinity, beta = Infinity) {
    // 終了条件：深さ0または終局
    if (depth <= 0) {
        return evaluateBoard(board);
    }

    const player = isMaximizing ? "white" : "black";
    const opponent = isMaximizing ? "black" : "white";

    // 有効な手を取得
    const validMoves = getValidMovesForBoard(board, player);

    // パスの処理
    if (validMoves.length === 0) {
        // 相手も打てない場合はゲーム終了
        const opponentMoves = getValidMovesForBoard(board, opponent);
        if (opponentMoves.length === 0) {
            console.log("[aiMakeMove] Game ended");
            return finalEvaluation(board); // 終局時の評価
        }
        // パスして相手の番
        return minimax(board, depth - 1, !isMaximizing, alpha, beta);
    }

    // 子ノードの探索
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    if (isMaximizing) {
        let maxEval = -Infinity;

        for (const [row, col] of validMoves) {
            // 試行的に手を適用
            const newBoard = applyMoveToBoard(board, row, col, player, directions);

            // 再帰的に評価
            const eval = minimax(newBoard, depth - 1, false, alpha, beta);

            maxEval = Math.max(maxEval, eval);
            alpha = Math.max(alpha, eval);

            // アルファベータ枝刈り
            if (beta <= alpha) {
                break;
            }
        }
        return maxEval;
    } else {
        let minEval = Infinity;

        for (const [row, col] of validMoves) {
            // 試行的に手を適用
            const newBoard = applyMoveToBoard(board, row, col, player, directions);

            // 再帰的に評価
            const eval = minimax(newBoard, depth - 1, true, alpha, beta);

            minEval = Math.min(minEval, eval);
            beta = Math.min(beta, eval);

            // アルファベータ枝刈り
            if (beta <= alpha) {
                break;
            }
        }
        return minEval;
    }
}

// 特定の盤面に対する有効な手を取得する関数
function getValidMovesForBoard(board, player) {
    const validMoves = [];
    const opponent = player === "black" ? "white" : "black";
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          
            if (board[row][col] !== "") continue;

            // この位置に石を置いたときに、相手の石を裏返せるか確認
            for (const [dx, dy] of directions) {
                let x = row + dx;
                let y = col + dy;
                let hasOpponent = false;

                while (isValidPosition(x, y) && board[x][y] === opponent) {
                    hasOpponent = true;
                    x += dx;
                    y += dy;
                }

                if (hasOpponent && isValidPosition(x, y) && board[x][y] === player) {
                    validMoves.push([row, col]);
                    break;
                }
            }
        }
    }

    return validMoves;
}

// 終局時の評価
function finalEvaluation(board) {
    const blackCount = board.flat().filter(cell => cell === 'black').length;
    const whiteCount = board.flat().filter(cell => cell === 'white').length;

    return (whiteCount - blackCount) * 1000;
}

// 盤面の評価関数
function evaluateBoard(board) {
    // 重み定数
    const cornerWeight = 100000;     // 角の重み
    const edgeWeight = 5;        // 辺の重み
    const mobilityWeight = 0.2;  // 機動力の重み
    const stabilityWeight = 3;   // 安定した石の重み
    const xcCellPenalty = 30;    // XCセルのペナルティ

    let blackScore = 0;
    let whiteScore = 0;


    // 石の数をカウント
    const blackCount = board.flat().filter(cell => cell === 'black').length;
    const whiteCount = board.flat().filter(cell => cell === 'white').length;
    const totalStones = blackCount + whiteCount;


    // 終局状態の特別処理
    if (totalStones === 64) {
        return (whiteCount - blackCount) * 1000;
    }

    // ゲームフェーズに応じて戦略を変更
    const gamePhase = totalStones / 64; // 0～1の範囲

    // 石の数の重み（終盤ほど重要に）
    const stoneCountWeight = gamePhase * 2 + 0.1;
    blackScore += blackCount * stoneCountWeight;
    whiteScore += whiteCount * stoneCountWeight;

    // 角の制御
    const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    for (const [row, col] of corners) {
        if (board[row][col] === 'black') blackScore += cornerWeight;
        else if (board[row][col] === 'white') whiteScore += cornerWeight;
    }

    // 辺の評価
    const edges = [];
    for (let i = 2; i <= 5; i++) {
        edges.push([0, i], [7, i], [i, 0], [i, 7]); // 上下左右の辺
    }
    for (const [row, col] of edges) {
        if (board[row][col] === 'black') blackScore += edgeWeight;
        else if (board[row][col] === 'white') whiteScore += edgeWeight;
    }

    // 危険な位置（XCセル）のペナルティ - 改良版
    const dangerPositions = [[1, 1], [1, 6], [6, 1], [6, 6]];
    for (const [row, col] of dangerPositions) {
        const nearCorner = getNearestCorner(row, col);
        const cornerState = board[nearCorner[0]][nearCorner[1]];
        
        // XCセルのペナルティはゲームの初期〜中盤で特に重要
        const xcPenaltyMultiplier = Math.max(0, 1 - gamePhase * 1.1); // ゲーム終盤に向けて減少
        
        // 角が空の場合は最大のペナルティ
        if (cornerState === '') {
            if (board[row][col] === 'black') blackScore -= xcCellPenalty * xcPenaltyMultiplier;
            if (board[row][col] === 'white') whiteScore -= xcCellPenalty * xcPenaltyMultiplier;
        }
        // 角が相手の石の場合も高いペナルティ
        else if ((cornerState === 'white' && board[row][col] === 'black') || 
                (cornerState === 'black' && board[row][col] === 'white')) {
            if (board[row][col] === 'black') blackScore -= xcCellPenalty * 0.8 * xcPenaltyMultiplier;
            if (board[row][col] === 'white') whiteScore -= xcCellPenalty * 0.8 * xcPenaltyMultiplier;
        }
        // 角が自分の石なら、XCセルは比較的安全
        // この場合はペナルティなし
    }



    // 機動力（有効手の数）の評価（序盤〜中盤で重要）
    if (gamePhase < 0.7) {
        const mobilityMultiplier = (1 - gamePhase) * mobilityWeight;
        const blackMobility = getValidMovesForBoard(board, 'black').length;
        const whiteMobility = getValidMovesForBoard(board, 'white').length;

        blackScore += blackMobility * mobilityMultiplier;
        whiteScore += whiteMobility * mobilityMultiplier;
    }

    // AIレベルに応じた評価戦略
    if (aiLevel > 4) {
        return whiteScore - blackScore;
    } else {
        return whiteCount - blackCount + (Math.random() * ( 3 - aiLevel) ) * 5 ;
    }
}

// 最も近い角の座標を返す
function getNearestCorner(row, col) {
    if (row <= 3) {
        if (col <= 3) return [0, 0];
        return [0, 7];
    } else {
        if (col <= 3) return [7, 0];
        return [7, 7];
    }
}

function changeTitle() {
    if (gameMode === 'ai') {
        document.getElementById('title').textContent = ai_h1;
        document.getElementById('level_ai').style.display = 'block';
    } else if (gameMode === 'player') {
        document.getElementById('title').textContent = player_h1;
        document.getElementById('level_ai').style.display = 'none';
    } else if (gameMode === 'online') {
        document.getElementById('title').textContent = online_h1;
        document.getElementById('level_ai').style.display = 'none';
    }
}

// インストールガイドを表示
function iOSinstallGuide() {
    document.getElementById("ios-install-guide").style.display = "block";
}

function showInstallPrompt() {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
            console.log("PWA installed");
        } else {
            console.log("PWA installation dismissed");
        }
        deferredPrompt = null;
    });

}

// サーバーから受信したパスメッセージに基づいて、ターン更新と表示を行う
function processPassMessage(data) {
    console.log(`[processPassMessage] Received pass message: ${JSON.stringify(data)}, old currentPlayer: ${currentPlayer}`);
    // data.new_turn がサーバーから送信された新しい手番
    currentPlayer = data.new_turn;

    if (currentPlayer === role_online) {
        alert(lang.opponent_pass);
    } else {
        alert(lang.you_pass);

    }

    // 状態更新（タイマーの再設定や手番表示更新）
    updateStatus();
}

// 石を置いたときにサーバーに送信
function sendMove(row, col) {

    const message = {
        action: "place_stone",
        row: row,
        col: col,
        player: currentPlayer
    };
    console.log("Sending WebSocket move:", message);
    console.log("online?:", online);
    socket.send(JSON.stringify(message));
}

function onlineUI() {
    // 通信対戦モードの場合のUI調整
    if (gameMode === 'online') {

        //設定から時間やハイライトを変更できないように消す
        document.getElementById('timeLimitContainer').style.display = 'none';
        document.getElementById('validContainer').style.display = 'none';



    } else {
        console.log("エラー：offline");
    }
}

function updatePlayerList(players) {
    console.log(`[updatePlayerList] Updating player list: ${JSON.stringify(players)}`);
    const playerListElement = document.getElementById('player-list');
    playerListElement.innerHTML = ''; // クリア

    Object.entries(players).forEach(([id, [ws_role, name]]) => {
        const role = (ws_role === "black") ? lang.black : (ws_role === "white") ? lang.white : lang.spec;
        const span = document.createElement('span');
        if (id === playerId) {
            span.style.fontWeight = 'bold';
            display_player_name = lang.you + `（${name}）`;
        } else {
            display_player_name = name;
        }
        span.textContent = ((role !== lang.black) ? "　" : "") + `${role}: ${display_player_name}`;
        playerListElement.appendChild(span);
    });
}


function changeHead() {
    let titleText, metaDescription, canonicalUrl;

    if (gameMode === 'ai') {
        titleText = ai_title;
        metaDescription = lang.ai_description;
        canonicalUrl = 'https://reversi.yuki-lab.com/ai/';
    } else if (gameMode === 'player') {
        titleText = player_title;
        metaDescription = lang.player_description;
        canonicalUrl = 'https://reversi.yuki-lab.com/';
    } else if (gameMode === 'online') {
        titleText = online_title;
        metaDescription = lang.online_description;
        canonicalUrl = 'https://reversi.yuki-lab.com/online/';
    } else {
        titleText = else_title;
        metaDescription = lang.else_description;
        canonicalUrl = 'https://reversi.yuki-lab.com/';
    }
    // ページのタイトルを変更
    document.title = titleText;

    // meta description を変更
    let metaTag = document.querySelector('meta[name="description"]');
    if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute('name', 'description');
        document.head.appendChild(metaTag);
    }
    metaTag.setAttribute('content', metaDescription);

    // canonical を変更
    let canonicalTag = document.querySelector("link[rel='canonical']");
    if (!canonicalTag) {
        canonicalTag = document.createElement("link");
        canonicalTag.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalTag);
    }
    canonicalTag.setAttribute("href", canonicalUrl);
}

//音量調整
victorySound.volume = 0.009;
defeatSound.volume = 0.008;
warningSound.volume = 0.08;
playerJoin.volume = 0.1;

//時間制限の「音量設定」のためのボックスの表示可否
if (timeLimit === 0) {
    document.getElementById("timeLimitBox_").style.display = "none";
} else {
    document.getElementById("timeLimitBox_").style.display = "block";
};

//画面トップに表示されるモード切り替えバナー
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const selectedMode = this.getAttribute('data-mode');
        const previousMode = gameMode;
        gameMode = selectedMode;
        localStorage.setItem('gameMode', selectedMode);
        // ボタンのactiveクラスを更新
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        changeTitle();  // タイトルなどの更新
        updateURL();    // URLパラメータの更新など必要なら行う
        changeHead();

        if (selectedMode === 'online') {
            online = true;  // オンラインモードのフラグを立てる
            restart();
        } else {
            document.getElementById("playerJoinSoundBox").style.display = "none";
            //もしあれば overlay を非表示
            if (overlay) {
                overlay.style.display = "none";
            }
            if (previousMode === 'online') {
                online = false; // オンラインモードのフラグを下げる
                const url = new URL(window.location);
                url.searchParams.delete("room");
                history.pushState(null, "", url);

                if (socket) {
                    socket.close();
                    socket = null;
                }
                restart();

            } else if (selectedMode === 'ai') {
                if (gameMode === 'ai' && currentPlayer === 'white' && !gameEnded) { startAIMove(); }
            }
        }
        //トップにスクロール
        document.getElementById('game-container').scrollIntoView({ behavior: "smooth" });
    });
});

if (document.readyState !== "loading") {
    document.removeEventListener("DOMContentLoaded", _DOMContenLoaded);
    _DOMContenLoaded();
} else {
    window.addEventListener('DOMContentLoaded', _DOMContenLoaded);
}

function _DOMContenLoaded() {
    const inviteBtn = document.getElementById("qr");
    const qrPopup = document.getElementById("qr-popup");
    const qrcodeContainer = document.getElementById("qrcode");
    var link = document.getElementById("dynamic-fonts");
    var dcss = document.getElementById("dynamic-css");
    if (link) {
        link.media = "all";
    }
    if (dcss) {
        dcss.media = "all";
    }

    if (inviteBtn && qrPopup && qrcodeContainer) {

        inviteBtn.addEventListener("click", function () {
            const inviteUrl = window.location.href;  // 現在のURLを取得
            qrcodeContainer.innerHTML = "";  // QRコードをクリア
            console.log("qr")
            new QRCode(qrcodeContainer, {
                text: inviteUrl,
                width: 200,
                height: 200
            });

            qrPopup.style.display = "flex";  // ポップアップを表示

            document.addEventListener("click", (e) => {
                // closest() で親要素をたどって .popup-content が見つかるかどうかを確認
                if (!e.target.closest(".qr-popup") && e.target.id !== "qr-icon") {
                    // 外側をクリックしたらポップアップを非表示
                    console.log("close" + e.target);
                    qrPopup.style.display = "none";
                }
            });

        });




    }


    document.getElementById("title").addEventListener("click", function () {
        location.reload(); // ページをリロード
    });
    if (startMatchBtn && overlay) {
        startMatchBtn.addEventListener("click", function () {


            copyURLToClipboard(true);



        });
    }

    document.querySelectorAll('.mode-btn').forEach(btn => {
        if (btn.getAttribute('data-mode') === gameMode) {
            btn.classList.add('active');
        }
    });

    if (gameMode === 'online') {
        onlineUI();
        online = true;
        if (gameRoom === null) {
            restart();
        }
        document.getElementById("playerJoinSoundBox").style.display = "block";
    } else {
        online = false;
        const url = new URL(window.location);
        url.searchParams.delete("room");
        history.replaceState(null, "", url);

        if (socket) {
            socket.close();
            socket = null;
        }
        document.getElementById("playerJoinSoundBox").style.display = "none";
        if (gameMode === 'ai') {
            document.getElementById('level_ai').style.display = 'block';
        } else {
            document.getElementById('level_ai').style.display = 'none';
        }
    }


}

function sendSettings() {
    let overlayTimeLimit = timelimit_el.value;
    let overlayHighlightMoves = highlightMoves_el.checked;
    timeLimit = overlayTimeLimit;
    showValidMoves = overlayHighlightMoves ? "true" : "false";

    localStorage.setItem('timeLimit', timeLimit);
    localStorage.setItem('showValidMoves', showValidMoves);




    socket.send(JSON.stringify({ action: "game_setting", time_limit: timeLimit, show_valid_moves: showValidMoves, player_name: playerName }));

}

function makeSocket() {

    socket = new WebSocket(`${ws_scheme}://${window.location.host}/ws/othello/${gameRoom}/?playerId=${playerId}&timeLimit=${timeLimit}&showValidMoves=${showValidMoves}&playerName=${encodeURIComponent(playerName)}&lang=${langCode}`);

    console.log(`Connecting to WebSocket server...${ws_scheme}://${window.location.host}/ws/othello/${gameRoom}/?playerId=${playerId}&timeLimit=${timeLimit}&showValidMoves=${showValidMoves}&playerName=${encodeURIComponent(playerName)}`);


    // 接続成功時
    socket.onopen = function (e) {
        console.log("WebSocket connection established.", e);
    };
    // メッセージ受信時（盤面を更新）
    socket.onmessage = function (e) {
        console.log("WebSocket message received:", e.data);
        const data = JSON.parse(e.data);

        if (data.error) {
            alert(`⚠️ ${data.error}`);
            return;
        }

        if (data.action === "place_stone") {
            board.innerHTML = '';
            refreshBoard()
            add4x4Markers();

            deserializeMoveHistory(data.history);
            console.log("moveHistory", moveHistory);
            replayMovesUpToIndex(moveHistory.length - 1, 1);

        } else if (data.action === "assign_role") {
            role_online = data.role; // サーバーから受け取った役割
            console.log(`あなたの役割: ${role_online}, データ${data}, (ID: ${playerId}), 再接続${data.reconnect}, ロール${role_online}`);
            if (role_online === 'black' && data.reconnect === false) {
                overlay.style.display = 'flex';
            }
            if (data.reconnect === true) {

                board.innerHTML = '';
                refreshBoard()
                add4x4Markers();
                deserializeMoveHistory(data.history);
                console.log("moveHistory", moveHistory);
                replayMovesUpToIndex(moveHistory.length - 1, 2);
            }

            //タイマーを止める
            timeLimit = 0;
            localStorage.setItem('timeLimit', timeLimit);
            stopTimer();
            document.getElementById("timeLimitBox_").style.display = "none";

        } else if (data.action === "update_players") {
            updatePlayerList(data.players);
            if (Object.keys(data.players).length === 2 && !data.setting) {
                if (role_online === 'black') {
                    sendSettings();
                }
                overlay.style.display = 'none';
                const qrPopup = document.getElementById("qr-popup");
                qrPopup.style.display = "none";
                highlightValidMoves();
            }
            if (playerJoinSoundEnabled) {
                if (data.player_id !== playerId) {
                    playerJoin.currentTime = 0;
                    playerJoin.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                }
            }
        } else if (data.action === "pass") {
            processPassMessage(data);
            return;
        } else if (data.action === "game_over") {
            endGame(data, data.winner);
            return;
        } else if (data.action === "game_start") {
            console.log(`Game started. ${data.time_limit},${data.show_valid_moves}.`);

            overlay.style.display = 'none';

            onlineGameStarted = true;



            const tempUrl = new URL(window.location);

            stopTimer();
            timeLimit = data.time_limit;
            localStorage.setItem('timeLimit', timeLimit);
            document.getElementById('timeLimitSelect').value = timeLimit;
            tempUrl.searchParams.set('timeLimit', timeLimit);
            console.log(`ゲームが開始されました。${data.show_valid_moves}`);
            showValidMoves = data.show_valid_moves === "true";
            localStorage.setItem('showValidMoves', showValidMoves);
            document.getElementById('showValidMovesCheckbox').checked = showValidMoves;
            tempUrl.searchParams.set('showValidMoves', showValidMoves);




            if (timeLimit === 0) {

                document.getElementById("timeLimitBox_").style.display = "none";
            } else {
                document.getElementById("timeLimitBox_").style.display = "block";
            }

            return;
        }
    };
}
function toHalfWidth(str) {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
}

// 音声をロード（すでにロード済みなら再利用）
async function getAudioBuffer(url) {
    if (placeStoneBuffer) return placeStoneBuffer;

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    placeStoneBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return placeStoneBuffer;
}



// 音声を再生（品質向上版）
async function playStoneSound() {
    if (audioContext.state === "suspended") {
        await audioContext.resume().then(() => {
            console.log("AudioContext resumed.");
            resumed = true
        }).catch((error) => {
            console.warn("Failed to resume AudioContext:", error);
        });
    }
    console.log("playStoneSound" + PLACE_STONE_SOUND);
    const buffer = await getAudioBuffer(PLACE_STONE_SOUND);
    console.log("buffer" + buffer);
    if (!buffer) return;
    console.log("now" + audioContext.currentTime);
    console.log("last" + lastPlayTime);
    const now = audioContext.currentTime;
    if (resumed) {
        resumed = false;
    } else {
        if (now - lastPlayTime < 0.1) return; // 0.1秒以内の多重再生を防ぐ}
    }
    lastPlayTime = now;

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(0);
}

// ページ離脱時に AudioContext を解放
window.addEventListener("beforeunload", async () => {
    if (audioContext.state !== "closed") {
        await audioContext.close();
    }
});




if (window.location.hostname !== "127.0.0.1") {
    console.log("Skipping source maps in production." + window.location.hostname);
    window.addEventListener("error", (e) => {
        if (e.filename.includes(".js.map")) {
            e.preventDefault();
        }
    });
}


// イベントリスナーを追加

copyUrlBtn.addEventListener('click', copyURLToClipboard);
document.getElementById('restart-btn').addEventListener('click', restart);
document.getElementById('prev-move-btn').addEventListener('click', goToPreviousMove);
document.getElementById('next-move-btn').addEventListener('click', goToNextMove);

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event; // イベントを保存

    // インストールを促すボタンを表示
    const installButton = document.getElementById("install-btn");
    installButton.style.display = "block";

    installButton.addEventListener("click", showInstallPrompt);
});
window.addEventListener("appinstalled", () => {
    alert(lang.thanks_install);
});

// 降伏ボタンをクリックしたとき、確認後にサーバーへ降伏メッセージを送信
if (surrenderBtn) {
    surrenderBtn.addEventListener('click', () => {
        if (confirm(lang.surrender_right)) {
            socket.send(JSON.stringify({ action: "surrender" }));
        }
    });
}
// 設定変更時に Local Storage に保存
document.getElementById('showValidMovesCheckbox').addEventListener('change', () => {
    showValidMoves = document.getElementById('showValidMovesCheckbox').checked;
    localStorage.setItem('showValidMoves', showValidMoves);




    updateStatus(); // 設定変更を反映
    updateURL(); // URL を更新
});


const timelimit_el = document.getElementById('time-limit');
const highlightMoves_el = document.getElementById('highlight-moves');

//time-limit要素が存在するかチェックし、存在する場合のみchangeイベントを確認
if (timelimit_el) {
    timelimit_el.addEventListener('change', () => {

        //sendSettings();

    });
}

if (highlightMoves_el) {
    highlightMoves_el.addEventListener('change', () => {
        //sendSettings();
    });
}

const playerName_el = document.getElementById('player-name');
if (playerName_el) {
    playerName_el.value = playerName;
    const warning = document.getElementById("warning");
    // プレイヤー名の保存ボタンの処理
    playerName_el.addEventListener("change", () => {

        const nameInput = toHalfWidth(playerName_el.value.trim());
        if (nameInput.length > 0) {
            playerName_el.value = nameInput;

            if (/^[a-zA-Z0-9]+$/.test(nameInput)) {

                playerName = profanityCleaner.clean(nameInput);
                document.getElementById("player-list").children[0].textContent = lang.black + ":" + lang.you + "(" + playerName + ")";

                playerName_el.value = playerName;
                localStorage.setItem("playerName", playerName);
                //sendSettings();
                warning.textContent = "";


            } else {
                warning.textContent = lang.warn_EnOnly;
            }

        } else {

            warning.textContent = lang.warn_charLimit;

        }



    });
}
document.getElementById("setting").addEventListener('click', () => {
    document.getElementById('settings').scrollIntoView({ behavior: "smooth" });
});
document.getElementById("close-install-guide").addEventListener("click", () => {
    document.getElementById("ios-install-guide").style.display = "none";
});
document.getElementById('showValidMovesCheckbox').checked = showValidMoves;

document.getElementById('timeLimitSelect').value = timeLimit;
document.getElementById('timeLimitSelect').addEventListener('change', () => {
    timeLimit = parseInt(document.getElementById('timeLimitSelect').value);
    localStorage.setItem('timeLimit', timeLimit);
    if (timeLimit === 0) {
        document.getElementById("timeLimitBox_").style.display = "none";
    } else {
        document.getElementById("timeLimitBox_").style.display = "block";
    }

});

document.getElementById('aiLevelSelect').value = aiLevel;
document.getElementById('aiLevelSelect').addEventListener('change', () => {
    aiLevel = parseInt(document.getElementById('aiLevelSelect').value);
    localStorage.setItem('aiLevel', aiLevel);

});



// 音声設定の変更を Local Storage に保存
document.getElementById('soundEffectsCheckbox').addEventListener('change', () => {
    soundEffects = document.getElementById('soundEffectsCheckbox').checked;
    localStorage.setItem('soundEffects', soundEffects);
});
document.getElementById('timeLimitSoundCheckbox').addEventListener('change', () => {
    timeLimitSoundEnabled = document.getElementById('timeLimitSoundCheckbox').checked;
    localStorage.setItem('timeLimitSoundEnabled', timeLimitSoundEnabled);
});
document.getElementById('playerJoinSoundCheckbox').addEventListener('change', () => {
    playerJoinSoundEnabled = document.getElementById('playerJoinSoundCheckbox').checked;
    localStorage.setItem('playerJoinSoundEnabled', playerJoinSoundEnabled);
});

document.getElementById('gameEndSoundCheckbox').addEventListener('change', () => {
    gameEndSoundEnabled = document.getElementById('gameEndSoundCheckbox').checked;
    localStorage.setItem('gameEndSoundEnabled', gameEndSoundEnabled);
});
window.addEventListener('popstate', function (event) {
    location.reload();
});



// 初期チェック状態を設定
document.getElementById('soundEffectsCheckbox').checked = soundEffects;
document.getElementById('timeLimitSoundCheckbox').checked = timeLimitSoundEnabled;
document.getElementById('gameEndSoundCheckbox').checked = gameEndSoundEnabled;
document.getElementById('playerJoinSoundCheckbox').checked = playerJoinSoundEnabled;

initializeBoard();