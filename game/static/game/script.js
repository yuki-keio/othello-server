const board = document.getElementById('board');
const statusB = document.getElementById('status');
const scoreB = document.getElementById('score_black');
const scoreW = document.getElementById('score_white');
const turnDisplay = document.getElementById('turn_display');
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
let placeStoneBufferPromise = null;

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
let gameEndSoundEnabled = localStorage.getItem('gameEndSoundEnabled') !== "false";
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
let ifVitory = false;

//言語設定
let langCode = "ja";
let gameMode = window.location.pathname.split('/').filter(Boolean)[0] || 'player';
if (gameMode === "en") {
    gameMode = window.location.pathname.split('/').filter(Boolean)[1] || 'player';
    langCode = "en";
}
let langNextAIName = false;

let aimove = false;

let online = false;
let role_online = "unknown";
let opponentName = undefined;

const rPopup = document.getElementById('result-popup');
const rBoverlay = document.getElementById('r-background-overlay');
const resultImg = document.getElementById('result-image');
const scoreDiff = document.getElementById('score-difference');
const rMessage = document.getElementById('r-message');
const rOverlay = document.getElementById('r-overlay');

function refreshBoard() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 8; i++) {
        const rowElement = document.createElement('div');
        rowElement.className = 'row';
        rowElement.setAttribute('role', 'row');
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
    if (!aimove) {
        const cell = event.target.closest('.cell');
        if (!cell) return;

        const row = parseInt(cell.dataset.row, 10);
        const col = parseInt(cell.dataset.col, 10);
        makeMove(row, col);
    }
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
        console.warn(`[applyServerMove] Invalid move: (${row},${col}), gameBoard[${row}][${col}]: ${gameBoard[row][col]}, isValidMove: ${isValidMove(row, col, player)}`);
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
    flipDiscs(row, col, player);
    recordMove(row, col, status);
    if (!online && isBoardFull()) {
        endGame("offline");
    } else {
        currentPlayer = (player === 'black') ? 'white' : 'black';

        if (!hasValidMove(currentPlayer)) {

            if (online) {
                if (role_online === currentPlayer && final === 1) {
                    socket.send(JSON.stringify({ action: "pass" }));
                }
            } else {
                if (status !== 1) {
                    if (status === 0) {
                        notifyNoValidMoves(currentPlayer); //友達対戦の場合のパス
                    } else if (status === 1) {
                        notifyNoValidMoves(currentPlayer);
                    } else if (status === 2) {
                        alert(lang.you_pass) // AIの後のパス
                    }
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
        if (final !== false || !online) {
            updateURL();
        }
    }
    if ((final !== false || !online)) {
        updateStatus();
    }
}

function startAIMove() {
    aimove = true;
    stopTimer();
    // 「考え中」のログを表示
    const timerDisplay_ = document.getElementById('timer-display');

    timerDisplay_.classList.remove('warning1', 'warning2');

    timerDisplay_.style.display = 'inline-block'; // 表示
    const timerPrefix = aiLevel === 6 ? "🐤 " : aiLevel === 9 ? "👺 " : aiLevel === 7 ? "🔆 " : "🤔 ";
    timerDisplay_.textContent = timerPrefix + lang.thinking;
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
            alert(`${lang.not_your_turn}${currentPlayer === 'black' ? lang.black : lang.white}, ${lang.you}：${roleDisplay}`);

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
        statusB.style.backgroundColor = '#000';
        turnDisplay.textContent = lang.black_turn;
    } else {
        statusB.style.backgroundColor = '#fff';
        turnDisplay.textContent = lang.white_turn;
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
            timerDisplay.style.display = 'inline-block';
            if (!gameEnded) startTimer();
        } else {
            timerDisplay.style.display = 'none';
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
    if (gameBoard.flat().filter(cell => cell !== '').length === 4) return;
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

function recordMove(row, col, status) {

    const cols = 'abcdefgh';
    const moveNotation = `${cols[col]}${row + 1}`;

    if (status !== 1) {
        moveHistory.push({ row, col, player: currentPlayer, moveNotation, token: "recordMove" });
        localStorage.setItem("deleted_urls", JSON.stringify([]));
    }
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

function serializeMoveHistory() {
    return moveHistory.map(move => `${move.player[0]}${move.row}${move.col}`).join('-');
}

function deserializeMoveHistory(serialized) {
    const moves_ = serialized.split('-');
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

    if (!navigator.onLine && modeFromPath === "online") {
        const offlinePath = langCode === "en" ? "/en/offline.html" : "/offline.html";
        window.location.href = offlinePath;
        return;
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

function copyURLToClipboard(matchRoom = false, fromResult = false) {
    let url = new URL(window.location);
    let alertText = lang.copy_url;
    let copyText;
    if (online) {
        if (onlineGameStarted) {
            alertText = lang.copy_spec;
        } else {
            alertText = lang.copy_invite;
        }
    }
    if (!matchRoom) {
        url.searchParams.set('won', share_winner);
    }
    if (fromResult) {
        alertText = lang.copy_result;
        url.searchParams.delete('timeLimit');
        if (gameMode === 'online') {
            url.searchParams.delete('room');
            copyText = url.toString().replace(/\/online\//, '/');
        }else{
            copyText = url.toString();
        }
        switch (langCode) {
            case "en":
                copyText = `${ifVitory ? "Victory!" : "Defeated..."}\nI played against ${opponentName} and ${ifVitory ? "won" : "lost"} by ${Math.abs(scoreB.textContent - scoreW.textContent)} points.\n\n【Final Score】 ⚫️ ${scoreB.textContent} : ${scoreW.textContent} ⚪️\n\n#ReversiWeb #Othello\n\n👇 Game record:\n${copyText}`;
                break;
            default:
                copyText = `${opponentName}に${Math.abs(scoreB.textContent - scoreW.textContent)}石差で【${ifVitory ? "勝利" : "敗北"}】\n\n結果 ▶ ⚫️ ${scoreB.textContent} vs ${scoreW.textContent} ⚪️\n\n#リバーシWeb #オセロ #ReversiWeb\n\n👇 棋譜はこちら！\n${copyText}`;
                break;
        }
    }else{
        copyText = url.toString();
    }
    navigator.clipboard.writeText(copyText).then(() => {
        alert(alertText);
    }).catch(err => {
        alert(lang.copy_failed);
        console.error('Failed to copy URL: ', err);
    });
}

function restart(reload = true) {
    if (online) {
        timeLimit = 0;
        localStorage.setItem('timeLimit', timeLimit);
        // 新しい部屋IDをランダムに生成（UUID の代わりに短いランダム文字列）
        const newRoomId = Math.random().toString(36).substring(2, 8);
        let newUrl = `${window.location.origin}/online/?room=${newRoomId}`;
        if (window.location.pathname.split('/').filter(Boolean)[0] === "en") {
            newUrl = `${window.location.origin}/en/online/?room=${newRoomId}`;
        }
        console.log(`[restart] New room URL: ${newUrl}`);
        if (reload) {
            window.location.href = newUrl; // 新しい部屋へ遷移
        } else {
            gameRoom = newRoomId;
            history.replaceState(null, '', newUrl);
        }
    } else {
        let newUrl = `${window.location.origin}/${gameMode}/`;
        if (gameMode === "player") {
            newUrl = `${window.location.origin}/`;
        }

        if (window.location.pathname.split('/').filter(Boolean)[0] === "en") {
            newUrl = `${window.location.origin}/en/${gameMode}/`;
            if (gameMode === "player") {
                newUrl = `${window.location.origin}/en/`;
            }
        }

        localStorage.setItem('deleted_urls', JSON.stringify([]));
        window.location.href = newUrl;
    }
}

function goToPreviousMove() {
    const url = new URL(window.location);
    const move_now = url.searchParams.get('moves');
    if (!move_now) {
        alert(lang.cant_go_more);
        return;
    }
    if (move_now.length > 3) {
        url.searchParams.set('moves', move_now.slice(0, move_now.lastIndexOf('-')));
    } else {
        url.searchParams.delete('moves');
    }
    if (localStorage.getItem('deleted_urls') === null) {
        localStorage.setItem('deleted_urls', JSON.stringify([move_now.slice(move_now.lastIndexOf('-') + 1)]));
    } else {
        let deleted_urls = JSON.parse(localStorage.getItem('deleted_urls'));
        deleted_urls.push(move_now.slice(move_now.lastIndexOf('-') + 1));
        localStorage.setItem('deleted_urls', JSON.stringify(deleted_urls));
    }
    sessionStorage.setItem("scrollY", window.scrollY);
    if (window.gtag) {
        gtag('event', 'go_to_previous_move', {
            'event_category': 'navigation',
            'event_label': move_now.slice(move_now.lastIndexOf('-') + 1),
        });
    } else {
        console.log("[goToPreviousMove] gtag not found");
    }
    window.location = url;
}

function goToNextMove() {
    const url = new URL(window.location);
    const move_now = url.searchParams.get('moves') ? url.searchParams.get('moves') + '-' : '';
    const deleted_urls = JSON.parse(localStorage.getItem('deleted_urls'));
    if (deleted_urls.length > 0) {
        url.searchParams.set('moves', move_now + deleted_urls.pop());

        localStorage.setItem('deleted_urls', JSON.stringify(deleted_urls));
        sessionStorage.setItem("scrollY", window.scrollY);
        if (window.gtag) {
            gtag('event', 'go_to_next_move', {
                'event_category': 'navigation',
                'event_label': deleted_urls.pop(),
            });
        } else {
            console.log("[goToNextMove] gtag not found");
        }
        window.location = url;

    } else {
        alert(lang.cant_go_more);
    }

}

function replayMovesUpToIndex(index, fromServer = false) {
    gameBoard = gameBoard.map(row => row.map(() => ''));
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
    const initialBoard = gameBoard.map(row => [...row]);
    const validMoves = hasValidMove();
    // 全ての有効な手を探索
    for (let i = 0; i < validMoves.length; i++) {
        const [row, col] = validMoves[i];
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
function applyMoveToBoard(board, row, col, player, directions) {
    const newBoard = board.map(row => [...row]);
    newBoard[row][col] = player;
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

    }
    if (minimax_depth < 0) {
        minimax_depth = 0;
    }
    if (minimax_depth > aiLevel) {
        minimax_depth = aiLevel;
    }
    console.log(`[aiMakeMove] Adjusted search depth to ${minimax_depth}`);
}

function endMove(bestMove, timeLimit, gameEnded, fromAI) {
    if (bestMove) {
        makeMove(bestMove.row, bestMove.col, 2);
    }
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

// ミニマックス法+アルファベータ枝刈り
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
    const cornerWeight = 30;     // 角の重み
    const edgeWeight = 5;        // 辺の重み
    const mobilityWeight = 0.2;  // 機動力の重み
    const xcCellPenalty = 7;    // XCセルのペナルティ

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

    // 危険な位置（XCセル）のペナルティ
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
    if (aiLevel > 1) {
        if (aiLevel === 6) {
            //! 「最弱級」指定のAI。評価関数は敢えて反転させる
            return blackScore - whiteScore;
        }
        return whiteScore - blackScore;
    } else {
        return whiteCount - blackCount;
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
        document.getElementById('title').innerHTML = "<span id=\"ai-level-display\">" + document.getElementById('aiLevelSelect').options[aiLevelSelect.selectedIndex].text + " AI</span>";
        document.getElementById('level_ai').style.display = 'block';
    } else if (gameMode === 'player') {
        document.getElementById('title').textContent = player_h1;
        document.getElementById('level_ai').style.display = 'none';
    } else if (gameMode === 'online') {
        document.getElementById('title').textContent = online_h1;
        document.getElementById('level_ai').style.display = 'none';
    }
}
function showLoading(after = 1000) {
    setTimeout(() => {
        // ローディング表示を追加
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        // オセロディスクのローディングアニメーション
        loadingOverlay.innerHTML = `
        <div class="loading-container">
            <div class="loading-disc">
                <div class="disc-inner"></div>
            </div>
            <div class="loading-text">Loading...</div>
        </div>
    `;
        document.body.appendChild(loadingOverlay);
    }, after);
}
function endGame(online_data, winner = null) {
    ifVitory = false;
    console.log(`[endGame] Game ended. Winner: ${winner}` + "gameMode:" + gameMode);
    const blackCount = gameBoard.flat().filter(cell => cell === 'black').length;
    const whiteCount = gameBoard.flat().filter(cell => cell === 'white').length;
    let result;

    gameEnded = true;

    if (gameMode === 'ai') {
        opponentName = aiLevelSelect.options[aiLevelSelect.selectedIndex].text + "AI";
    }
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
        } else {
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
        }
    }
    gtag('event', 'game_result', {
        'result': ifVitory,
        'gameMode': gameMode,
        'player_id': playerId,
        'timeLimit': timeLimit,
        'showValidMoves': showValidMoves,
        'aiLevel': aiLevel,
        'gameEndSoundEnabled': gameEndSoundEnabled,
        'placeStoneSoundEnabled': soundEffects,
        'playerJoinSoundEnabled': playerJoinSoundEnabled,
        'timeLimitSoundEnabled': timeLimitSoundEnabled,
    });

    url = new URL(window.location);
    url.searchParams.set('won', share_winner);
    history.pushState(null, '', url);

    document.getElementById('score_display').innerHTML = `${result} | <span id="black_circle"></span> ${blackCount} : ${whiteCount} <span id="white_circle"></span>`;

    const winner_final = share_winner === "won" ? (blackCount > whiteCount ? "black": "white") : share_winner;

    stopTimer();
    showResultPopup(ifVitory, blackCount, whiteCount,winner_final);
    setTimeout(() => {
        gameFinishedCount++;
        localStorage.setItem('gameFinishedCount', gameFinishedCount);
        if (gameFinishedCount === 1 && deferredPrompt) {
            showInstallPrompt();
        } else if (gameFinishedCount === 3 && deferredPrompt) {
            showInstallPrompt();
        }
        if (isIOS() && !window.navigator.standalone && gameFinishedCount === 1) {
            iOSinstallGuide();
        } else if (isIOS() && !window.navigator.standalone && gameFinishedCount === 3) {
            iOSinstallGuide();
        } else {
            if (gameMode === "ai" && ifVitory) {
                const currentAiLevel = document.getElementById('aiLevelSelect').value;
                if (window.unlockNextAiLevel) {
                    window.unlockNextAiLevel(currentAiLevel);
                }
            }
        }
    }, 2000);
}

function launchConfetti() {
    const rect = board.getBoundingClientRect()
    const windowHeight = window.innerHeight;
    const originY = (rect.top + rect.height) / windowHeight;
    ifVitory = true;

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
function showDialog(type, value = null) {
    const shouldHide = localStorage.getItem("hide" + type + "Dialog") === "true";
    if (!shouldHide) {
        if (type === "role") {
            if (value === "black") {
                document.getElementById(type + "-dialog-content").textContent = lang.roleDialogB;
            } else {
                document.getElementById(type + "-dialog-content").textContent = lang.roleDialogW;
            }
        }
        document.getElementById(type + "-dialog").style.display = "block";
        document.getElementById(type + "-dialog-overlay").style.display = "block";
        let okBtn = null;
        if (type === "role") {
            okBtn = document.getElementById("closeRoleDialog");
        }
        if (okBtn) {
            const keyHandler = (event) => {
                if (event.key === "Enter") {
                    okBtn.click();
                }
            };
            document.addEventListener("keydown", keyHandler);
            // 一度だけ実行するように、OKボタンでリスナー解除
            okBtn.addEventListener("click", () => {
                document.removeEventListener("keydown", keyHandler);
            });
        }
    }
}
function closeDialog(type) {
    document.getElementById(type + "-dialog").style.display = "none";
    document.getElementById(type + "-dialog-overlay").style.display = "none";
    localStorage.setItem("hide" + type + "Dialog", document.getElementById(type + "-not-checkbox").checked);
}
function preloadResultImages() {
    const images = [
        'https://reversi.yuki-lab.com/static/game/images/win.png',
        'https://reversi.yuki-lab.com/static/game/images/lose.png',
        'https://reversi.yuki-lab.com/static/game/images/draw.png',
        'https://reversi.yuki-lab.com/static/game/images/laurel.webp'
    ];
    images.forEach((src) => {
        const img = new Image();
        img.src = src;
    });
}
function showResultPopup(victory, scoreBlack, scoreWhite,f_winner) {
    const _draw = (scoreBlack === scoreWhite) ? (share_winner==="won") : false;
    let imagePath = '';

    if (victory) {
        imagePath = 'https://reversi.yuki-lab.com/static/game/images/win.png';
    } else if (_draw) {
        imagePath = 'https://reversi.yuki-lab.com/static/game/images/draw.png';
        rOverlay.style.backgroundImage = "none";
    } else {
        imagePath = 'https://reversi.yuki-lab.com/static/game/images/lose.png';
        rOverlay.style.backgroundImage = "none";
    }
    switch (langCode) {
        case "en":
            if (_draw) {
                rMessage.textContent = `🤝 You drew with ${opponentName}`;
            }else{
                rMessage.textContent = (victory ? "🏆️ " : "") +  ((typeof opponentName === 'undefined') ? ((f_winner==="black")?"Black":"White"):"You") + (victory?" won":" lost") + ((typeof opponentName === 'undefined')?"":` against ${opponentName}`) +` by ${Math.abs(scoreBlack - scoreWhite)} points!`;
            }
            break;
        default:
            rMessage.textContent = (victory ? "🏆️ " : "") + ((typeof opponentName === 'undefined') ? ((f_winner==="black")?"黒が":"白が"):`${opponentName}に`)+`${Math.abs(scoreBlack - scoreWhite)}点差で${ifVitory ? "勝利！" : _draw?"引き分け": "敗北"}`;
            break;
    }
    scoreDiff.textContent = `⚫️ ${scoreBlack} : ${scoreWhite} ⚪️`;
    resultImg.src = imagePath;
    rPopup.style.display = 'block';
    rBoverlay.style.display = 'block';
}

function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// インストールガイドを表示
function iOSinstallGuide() {
    document.getElementById("ios-install-guide").style.display = "block";
}

function showInstallPrompt() {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
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
            if (ws_role !== "spectator") {
                opponentName = name;
            }
        }
        span.innerHTML = ((role !== lang.black) ? "　" : "") + `${(role === lang.black) ? '<span id="black_circle"></span>' : (role === lang.white) ? '<span id="white_circle"></span>' : role + ":"} ${escapeHTML(display_player_name)}`;
        playerListElement.appendChild(span);
    });
    if (Object.keys(players).length === 1) {
        const span = document.createElement('span');
        span.innerHTML = '　<span id="white_circle"></span> ' + lang.opponent;
        playerListElement.appendChild(span);
    }
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
victorySound.volume = 0.013;
defeatSound.volume = 0.012;
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
        if (selectedMode === previousMode) return;
        localStorage.setItem('gameMode', selectedMode);
        // ボタンのactiveクラスを更新
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        changeTitle();  // タイトルなどの更新
        updateURL();    // URLパラメータの更新など必要なら行う
        changeHead();

        if (selectedMode === 'online') {
            online = true;  // オンラインモードのフラグを立てる
            showLoading();
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
                showLoading();
                restart();

            } else if (selectedMode === 'ai') {
                if (gameMode === 'ai' && currentPlayer === 'white' && !gameEnded) { startAIMove(); }
                initAIMode();
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
    const savedScrollY = sessionStorage.getItem("scrollY");
    console.log("scrollY", savedScrollY);
    if (savedScrollY !== null) {
        window.scrollTo(0, parseInt(savedScrollY));
        sessionStorage.removeItem("scrollY");
    }
    placeStoneBufferPromise = getAudioBuffer(PLACE_STONE_SOUND).then(buffer => {
            console.log("Audio preloaded");
    }).catch(e => console.error("Failed to preload audio:", e));

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
        if (gameMode === "ai") {
        } else {
            location.reload(); // ページをリロード
        }

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
            restart(false); //リロードはfalse
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

    if (gameMode === 'ai') {
        initAIMode()
    }
}
function initAIMode() {
    const aiLevelSelect = document.getElementById('aiLevelSelect');

    document.getElementById("ai-level-display").addEventListener("click", function () {
        const popup = document.getElementById('ai-level-popup');
        popup.style.display = popup.style.display !== 'block' ? 'block' : 'none';
        updateAiLevelDisplay();
    });
    // 保存されたAIレベル解放状況を確認
    const unlockedLevels = JSON.parse(localStorage.getItem('unlockedAiLevels') || '{"0":true,"1":true,"2":true,"6":true}');
    console.log(`[aiLevelSelect] Unlocked levels: ${JSON.stringify(unlockedLevels)}`);
    // ロックされたレベルを処理
    const lockedOptions = document.querySelectorAll('.locked-level');
    lockedOptions.forEach(option => {
        const unlockLevel = option.getAttribute('data-unlock-level')
        console.log(`[aiLevelSelect] Locking level v ${option.getAttribute("data-level")}`);
        console.log(`[aiLevelSelect] Locking level t ${option.textContent}`);
        if (unlockedLevels[option.getAttribute("data-level") || option.value]) {
            option.classList.remove('locked-level');
            option.disabled = false;
            option.style.display = '';
        } else if (unlockedLevels[unlockLevel]) {
            const level_before = document.querySelector('#aiLevelSelect option[value="' + unlockLevel + '"]');
            if (option.getAttribute("data-level")){
                langNextAIName = option.textContent;
            }
            switch (langCode) {
                case "en":
                    option.textContent = `Next Level: Defeat ${level_before.textContent} to unlock`;
                    break;
                default:
                    option.textContent = `次のレベル : ${level_before.textContent}AIに勝利で解放`;
                    break;
            }
            option.disabled = true;
        } else {
            option.style.display = 'none';
        }
    });
    // AIに勝った時のイベントハンドラ
    window.unlockNextAiLevel = function (currentLevel) {
        const nextLevelOption = Array.from(aiLevelSelect.querySelectorAll('.locked-level')).find(
            option => option.getAttribute('data-unlock-level') == currentLevel
        );

        if (nextLevelOption) {
            const nextLevel = nextLevelOption.value;
            unlockedLevels[nextLevel] = true;
            localStorage.setItem('unlockedAiLevels', JSON.stringify(unlockedLevels));
            // 解放メッセージを表示
            alert(lang.congrats_aiLevel_unlocked_b + langNextAIName + lang.congrats_aiLevel_unlocked_a);
            document.getElementById('restart-match').textContent = lang.nextLevel;
            localStorage.setItem('aiLevel', nextLevel);
        }
    };

    // AIレベル表示の更新関数
    function updateAiLevelDisplay() {
        const currentLevel = aiLevelSelect.options[aiLevelSelect.selectedIndex].text;
        const displayEl = document.getElementById('ai-level-display');
        displayEl.textContent = `${currentLevel} AI`;

        // ポップアップ内の選択状態も更新
        const levelItems = document.querySelectorAll('.ai-level-item');
        levelItems.forEach(item => {
            if (item.getAttribute('data-level') === aiLevelSelect.value) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

    }

    // AIレベル選択時の処理
    const levelItems = document.querySelectorAll('.ai-level-item');
    levelItems.forEach(item => {
        item.addEventListener('click', function () {
            // ロックされたレベルは選択不可
            if (this.classList.contains('locked-level')) {
                return;
            }

            const level = this.getAttribute('data-level');
            aiLevelSelect.value = level;

            // 既存のchangeイベントをトリガー
            const event = new Event('change');
            aiLevelSelect.dispatchEvent(event);

            updateAiLevelDisplay();

            // ポップアップを閉じる
            document.getElementById('ai-level-popup').style.display = 'none';

            const __url = new URL(window.location);
            __url.searchParams.delete("moves");
            __url.searchParams.delete("won");
            __url.searchParams.set('aiLevel', level);

            history.pushState(null, "", __url);
            location.reload();
        });
    });

    // ポップアップ外クリックで閉じる
    document.addEventListener('click', function (e) {
        const popup = document.getElementById('ai-level-popup');

        if (popup.style.display === 'block' && !popup.contains(e.target) && e.target !== document.getElementById('ai-level-display')) {
            popup.style.display = 'none';
        }
    });

    aiLevelSelect.addEventListener('change', updateAiLevelDisplay);
    // 初期表示を設定
    setTimeout(updateAiLevelDisplay, 100);

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
            if (data.n_players === 1) {
                overlay.style.display = 'flex';
            }
            if (data.reconnect === true) {
                board.innerHTML = '';
                refreshBoard()
                add4x4Markers();
                deserializeMoveHistory(data.history);
                console.log("moveHistory", moveHistory);
                replayMovesUpToIndex(moveHistory.length - 1, 2);
                stopTimer();
                document.getElementById("timer-display").textContent = "- : --";
                timeLimit = data.time_limit;
                localStorage.setItem('timeLimit', timeLimit);
                document.getElementById('timeLimitSelect').value = timeLimit;
                console.log(`ゲームが再開されました。${data.show_valid_moves}`);
                showValidMoves = data.show_valid_moves === "true";
                localStorage.setItem('showValidMoves', showValidMoves);
                document.getElementById('showValidMovesCheckbox').checked = showValidMoves;
                if (timeLimit === 0) {
                    document.getElementById("timeLimitBox_").style.display = "none";
                } else {
                    document.getElementById("timeLimitBox_").style.display = "block";
                }

                if (data.n_players !== 1) {
                    document.getElementById("restart-btn").disabled = false;
                    document.getElementById("surrender-btn").disabled = false;
                }
                console.log("reconnect", data);
            }else{
            //タイマーを止める
            timeLimit = 0;
            localStorage.setItem('timeLimit', timeLimit);
            stopTimer();
            document.getElementById("timeLimitBox_").style.display = "none";
            }
        } else if (data.action === "update_players") {
            updatePlayerList(data.players);
            if(data.by_reconnect) return;
            if (Object.keys(data.players).length === 2 && !data.setting) {
                if (role_online === 'black') {
                    sendSettings();
                }
                showDialog("role", role_online);
                overlay.style.display = 'none';
                const qrPopup = document.getElementById("qr-popup");
                qrPopup.style.display = "none";
                highlightValidMoves();
                document.getElementById("restart-btn").disabled = false;
                document.getElementById("surrender-btn").disabled = false;
            }
            if (playerJoinSoundEnabled) {
                if (data.player_id !== playerId) {
                    playerJoin.currentTime = 0;
                    playerJoin.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                }
            }
            if (data.setting){
                stopTimer();
                timeLimit = data.time_limit;
                localStorage.setItem('timeLimit', timeLimit);
                document.getElementById('timeLimitSelect').value = timeLimit;
                showValidMoves = data.show_valid_moves === "true";
                localStorage.setItem('showValidMoves', showValidMoves);
                document.getElementById('showValidMovesCheckbox').checked = showValidMoves;
                const s_timerDisplay = document.getElementById('timer-display');
                if (timeLimit === 0) {
                    document.getElementById("timeLimitBox_").style.display = "none";
                    s_timerDisplay.style.display = "none";
                } else {
                    document.getElementById("timeLimitBox_").style.display = "block";
                    s_timerDisplay.style.display = "block";
                    s_timerDisplay.textContent = formatTime(timeLimit);
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
            onlineGameStarted = true;
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
    // バッファがすでにロード済みならawait不要
    if (!placeStoneBuffer) {
        try {
            await placeStoneBufferPromise; // 初回のみawait（すでにロード済なら即時解決）
        } catch (e) {
            console.warn("Buffer failed to load:", e);
            return;
        }
    }
    const buffer = placeStoneBuffer;
    if (!buffer) return;
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
document.getElementById('r-share-btn').addEventListener('click', () => { copyURLToClipboard(false, true) });
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
    // ユーザーのブラウザ情報を取得
    const browser = navigator.userAgent.includes('Chrome') ? 'Chrome' :
        navigator.userAgent.includes('Safari') ? 'Safari' :
            navigator.userAgent.includes('Firefox') ? 'Firefox' :
                'Other';
    // Google Analytics にイベント送信
    gtag('event', 'pwa_installed', {
        'event_category': 'engagement',
        'event_label': 'PWA Installed',
        'browser': browser,
        'timestamp': new Date().toISOString(),
        "id": playerId,
        'game_mode': gameMode,
        "gameFinishedCount": gameFinishedCount,
        "Won": ifVitory,
    });
});
// 降伏ボタンをクリックしたとき、確認後にサーバーへ降伏メッセージを送信
if (surrenderBtn) {
    surrenderBtn.addEventListener('click', () => {
        if (confirm(lang.surrender_right)) {
            socket.send(JSON.stringify({ action: "surrender" }));
        }
    });
    document.getElementById("info-button").addEventListener("click", function() {
        alert(`${lang.how2play_with_friend}`);
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
const closeRoleDialog_el = document.getElementById("closeRoleDialog");
if (closeRoleDialog_el) {
    closeRoleDialog_el.addEventListener("click", () => {
        closeDialog("role");
    });
    document.getElementById("role-dialog-overlay").addEventListener("click", () => {
        closeDialog("role");
    }
    );

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
                document.getElementById("player-list").children[0].innerHTML = '<span id="black_circle"></span> ' + lang.you + "(" + escapeHTML(playerName) + ")";
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
    if (gameMode === "ai" && ifVitory) {
        const currentAiLevel = document.getElementById('aiLevelSelect').value;
        if (window.unlockNextAiLevel) {
            window.unlockNextAiLevel(currentAiLevel);
        }
    }
});

document.getElementById('timeLimitSelect').value = timeLimit;
document.getElementById('timeLimitSelect').addEventListener('change', () => {
    timeLimit = parseInt(document.getElementById('timeLimitSelect').value);
    localStorage.setItem('timeLimit', timeLimit);
    if (timeLimit === 0) {
        document.getElementById("timeLimitBox_").style.display = "none";
    } else {
        const t_display = document.getElementById('timer-display')
        stopTimer();
        t_display.classList.remove('warning1', 'warning2');
        t_display.style.display = 'inline-block';
        t_display.textContent = formatTime(timeLimit);
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

// ポップアップを右側に少しだけ残した「折りたたみ状態」にする関数
function collapseResultPopup() {
    rBoverlay.style.display = 'none';
    rPopup.classList.add('collapsed');
}
// ポップアップを完全表示にする関数
function expandResultPopup() {
    rBoverlay.style.display = 'block';
    rPopup.classList.remove('collapsed');
}
document.getElementById('close-result').addEventListener('click', () => {
    document.getElementById('restart-btn').classList.add('shine-button');
    collapseResultPopup();
});
rPopup.addEventListener('click', (event) => {
    if (rPopup.classList.contains('collapsed') && event.target !== document.getElementById('close-result')) {
        event.stopPropagation();
        expandResultPopup();
    }
});
document.getElementById('tweet-result').addEventListener('click', () => {
    let t_url = new URL(window.location);
    t_url.searchParams.delete("room");
    t_url.searchParams.delete("timeLimit");
    t_url = t_url.toString();
    const _draw = (scoreB.textContent === scoreW.textContent) ? (share_winner==="won") : false;
    if (gameMode === 'online') {
        t_url = t_url.replace(/\/online\//, '/');
    }
    let tweetText = '';
    switch (langCode) {
        case "en":
            if (_draw) {
                tweetText = `🤝 I drew with ${opponentName}!\n\n【Final Score】 ⚫️ ${scoreB.textContent} : ${scoreW.textContent} ⚪️\n\n#ReversiWeb #Othello\n\n👇 Game record:\n${t_url}`;}
            else{
                tweetText = `${ifVitory ? "Victory!" : "Defeated..."}\nI ${((typeof opponentName === 'undefined')?"":` against ${opponentName} and`)} ${ifVitory ? "won" : "lost"} by ${Math.abs(scoreB.textContent - scoreW.textContent)} points.\n\n【Final Score】 ⚫️ ${scoreB.textContent} : ${scoreW.textContent} ⚪️\n\n#ReversiWeb #Othello\n\n👇 Game record:\n${t_url}`;
                }
            break;
        default:
            tweetText = `${((typeof opponentName === 'undefined')?"":`${opponentName}に`)}${Math.abs(scoreB.textContent - scoreW.textContent)}石差で【${ifVitory ? "勝利" : "敗北"}】\n\n結果 ▶ ⚫️ ${scoreB.textContent} vs ${scoreW.textContent} ⚪️\n\n#リバーシWeb #オセロ #ReversiWeb\n\n👇 棋譜はこちら！\n${t_url}`;
            break;
    }
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterIntentUrl, '_blank');
});
document.getElementById('restart-match').addEventListener('click', () => {
    gtag('event', 'next_match', {
        'event_category': 'engagement',
        'event_label': ifVitory ? 'NextMatch_afterVictory' : 'NextMatch_afterDefeated',
        'gameEndSoundEnabled': gameEndSoundEnabled,
    });
    restart();
});

initializeBoard();