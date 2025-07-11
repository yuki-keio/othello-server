const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const surrenderBtn = document.getElementById('surrender-btn');
const overlay = document.getElementById("online-overlay");
const closeRoleDialogElement = document.getElementById("closeRoleDialog");
const webMatchBtn = document.getElementById("web-match");
let aiworker = null;
const s_timerDisplay = document.getElementById('timer-display');
let waitInterval = null;

window.showDialog = function (type, value = null) {
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
window.closeDialog = function (type) {
    document.getElementById(type + "-dialog").style.display = "none";
    document.getElementById(type + "-dialog-overlay").style.display = "none";
    localStorage.setItem("hide" + type + "Dialog", document.getElementById(type + "-not-checkbox").checked);
}
function __DOMContentLoaded() {
    makeSocket();
    if (sessionStorage.getItem("fromMode")) {
        document.getElementById("online-overlay").style.display = "flex";
        sessionStorage.removeItem("fromMode");
    }
    localStorage.setItem("deleted_urls", JSON.stringify([]));
    document.getElementById('next-move-btn').style.display = 'none';
    webMatchBtn.addEventListener("click", () => {
        webMatchBtn.disabled = true;
        matchSocket();
        console.log("Web match button clicked");
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
window.sendMove = function (row, col) {
    const message = {
        action: "place_stone",
        row: row,
        col: col,
        player: currentPlayer
    };
    console.log("Sending WebSocket move:", message);
    socket.send(JSON.stringify(message));
}
window.updatePlayerList = function (players) {
    console.log(`[updatePlayerList] Updating player list: ${JSON.stringify(players)}`);
    const playerListElement = document.getElementById('player-list');
    playerListElement.innerHTML = ''; // クリア

    Object.entries(players).forEach(([id, [ws_role, name, connected]]) => {
        const role = (ws_role === "black") ? lang.black : (ws_role === "white") ? lang.white : lang.spec;
        const span = document.createElement('span');
        let display_player_name;
        if (id === playerId) {
            span.style.fontWeight = 'bold';
            display_player_name = lang.you + `（${name}）`;
        } else {
            display_player_name = name;
            if (ws_role !== "spectator") {
                opponentName = name;
            }
        }
        span.innerHTML = ((ws_role !== currentPlayer) ? "　" : "") + `${(ws_role === currentPlayer) ? '<span id="p_current_circle" class="current_circle"></span>' : (ws_role === (currentPlayer === "black" ? "white" : "black")) ? '<span id="p_next_circle" class="next_circle"></span>' : role + ":"} ${connected ? escapeHTML(display_player_name) : "Connecting..."}`;
        if (ws_role === currentPlayer) {
            playerListElement.insertBefore(span, playerListElement.firstChild);
        } else {
            playerListElement.appendChild(span);
        }
    });
    updateStatus();
    if (Object.keys(players).length === 1) {
        const span = document.createElement('span');
        span.innerHTML = '　<span id="p_next_circle" class="next_circle"></span> ' + lang.opponent;
        playerListElement.appendChild(span);
    }
}
function sendSettings() {
    let onlineTimeLimit = document.getElementById('timeLimitSelect').value
    let onlineHighlightMoves = document.getElementById('showValidMovesCheckbox').checked;
    if (sessionStorage.getItem("matchmaking") === "true") {
        onlineTimeLimit = 20;
        onlineHighlightMoves = true;
    }

    timeLimit = onlineTimeLimit;
    showValidMoves = onlineHighlightMoves ? "true" : "false"; //バックエンドとの整合性のために文字列に変換

    localStorage.setItem('timeLimit', timeLimit);
    localStorage.setItem('showValidMoves', showValidMoves);

    if (sessionStorage.getItem("bot_match") !== "true") {
        window.socket.send(JSON.stringify({ action: "game_setting", time_limit: timeLimit, show_valid_moves: showValidMoves, player_name: playerName }));
    }
}
function toHalfWidth(str) {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
}
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function matchSocket() {
    console.log("Match socket function called");
    if (window.socket) {
        socket.close();
        socket = null;
    }
    const mSocket = new WebSocket(`${ws_scheme}://${location.host}/ws/match/`);
    mSocket.onopen = () => {
        console.log("Match socket connection established.");
        mSocket.send(JSON.stringify({ type: "join", player_id: playerId, allow_bot: window.acceptBot }));
        if (window.gtag) {
            gtag('event', 'matchmaking_start', {
                'event_category': 'engagement',
                'event_label': 'matchmaking',
            });
        } else {
            console.log("gtag not found");
        }
    };
    mSocket.onmessage = (e) => {
        const data = JSON.parse(e.data);
        console.log("Match socket message received:", data);
        if (data.type === "waiting") {
            webMatchBtn.disabled = false;
            const loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loading-overlay';
            // オセロディスクのローディングアニメーション
            loadingOverlay.innerHTML = `
                    <div class="loading-container">
                        <div class="loading-disc">
                            <div class="disc-inner"></div>
                        </div>
                        <div class="loading-text">${lang.matchmaking}</div>
                        <br>
                        <div id="match_display">${lang.estimatedTime}<span id="waitTime"></span>${lang.seconds}</div>
                        <div id="matching-ad">${adElement}</div>
                        <button id="cancel-matchmaking-btn" class="cancel-button">✕</button>
                    </div>
                `;
            document.body.appendChild(loadingOverlay);
            if (adElement.length > 0) {
                document.getElementById("matching-ad").style.height = "375px";
                setTimeout(() => {
                    try {
                        (adsbygoogle = window.adsbygoogle || []).push({});
                    } catch (e) {
                        console.warn("adsbygoogle error:", e);
                    }
                }, 100);
            }
            document.getElementById("cancel-matchmaking-btn").addEventListener("click", () => {
                if (mSocket && mSocket.readyState === WebSocket.OPEN) {
                    mSocket.send(JSON.stringify({ type: "cancel_join", player_id: playerId }));
                }
                mSocket.close(); // WebSocketをクローズ
                document.getElementById('loading-overlay')?.remove();
                clearInterval(waitInterval);
                webMatchBtn.disabled = false;
                console.log("Matchmaking cancelled by user.");
            });

            const waitTimeElement = document.getElementById("waitTime");
            let waitTime = 32;
            waitInterval = setInterval(() => {
                waitTime -= waitTime / 70;
                waitTimeElement.textContent = Number(waitTime).toPrecision(3);
            }, 100);
        }
        if (data.type === "matched") {
            clearInterval(waitInterval);
            webMatchBtn.disabled = false;
            gameRoom = data.room_id;
            match_role = data.color;
            console.log(`Matched with room ID: ${gameRoom}, role: ${match_role}`);
            mSocket.close();
            document.getElementById('loading-overlay')?.remove();
            const murl = new URL(window.location);
            murl.searchParams.set('room', gameRoom);
            window.history.replaceState({}, '', murl);
            if (data.opponent_player_id === "bot") {
                opponentName = "αβγδεζηθικλμνξοπρστυφχψω"[aiLevel] + "Bot";
                sessionStorage.setItem("bot_match", "true");
                aiworker = new Worker(workerPath);
                role_online = data.color;
                timeLimit = 20;
                showValidMoves = true;
                localStorage.setItem('timeLimit', timeLimit);
                localStorage.setItem('showValidMoves', showValidMoves);
                document.getElementById("timeLimitBox_").style.display = "block";
                s_timerDisplay.style.display = "block";
                s_timerDisplay.textContent = formatTime(timeLimit);
                if (playerJoinSoundEnabled) {
                    if (data.player_id !== playerId) {
                        playerJoin.currentTime = 0;
                        playerJoin.play().catch(error => {
                            console.warn("audio was blocked:", error);
                        });
                    }
                }
                showDialog("role", role_online);
                overlay.style.display = 'none';
                const qrPopup = document.getElementById("qr-popup");
                qrPopup.style.display = "none";
                onlineUI();
                highlightValidMoves();
                document.getElementById("restart-btn").disabled = false;
                surrenderBtn.disabled = false;
                if (window.gtag) {
                    gtag('event', 'bot_match', {
                        'event_category': 'engagement',
                        'event_label': 'bot_matchmade',
                    });
                } else {
                    console.log("gtag not found");
                }
            } else {
                sessionStorage.setItem("matchmaking", "true");

                makeSocket(match_role);
                if (window.gtag) {
                    gtag('event', 'match_made', {
                        'event_category': 'engagement',
                        'event_label': 'matchmade',
                    });
                } else {
                    console.log("gtag not found");
                }
            }
        }
    };

}
function makeSocket(role = "default") {
    socket = new WebSocket(`${ws_scheme}://${window.location.host}/ws/othello/${gameRoom}/?playerId=${playerId}&timeLimit=${timeLimit}&showValidMoves=${showValidMoves}&playerName=${encodeURIComponent(playerName)}&lang=${langCode}&role=${role}`);

    // 接続成功時
    window.socket.onopen = function (e) {
        console.log("WebSocket connection established.", e);
    };
    // メッセージ受信時（盤面を更新）
    window.socket.onmessage = function (e) {
        console.log("WebSocket message received:", e.data);
        const data = JSON.parse(e.data);

        if (data.error) {
            alert(`⚠️ ${data.error}`);
            return;
        }
        if (data.action === "place_stone") {
            board.innerHTML = '';
            refreshBoard();
            add4x4Markers();

            deserializeMoveHistory(data.history);
            console.log("moveHistory", moveHistory);
            replayMovesUpToIndex(moveHistory.length - 1, 1);
            updatePlayerList(data.players);
        } else if (data.action === "assign_role") {
            role_online = data.role; // サーバーから受け取った役割
            console.log(`あなたの役割: ${role_online}, データ${data}, (ID: ${playerId}), 再接続${data.reconnect}, ロール${role_online}`);
            if (data.n_players === 1) {
                overlay.style.display = 'flex';
                if (sessionStorage.getItem("matchAgain") === "true") {
                    document.getElementById("online-overlay").style.display = "flex";
                    webMatchBtn.click();
                    sessionStorage.removeItem("matchAgain");
                }
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
                    surrenderBtn.disabled = false;
                }
                console.log("reconnect", data);
            } else {
                //タイマーを止める
                timeLimit = 0;
                localStorage.setItem('timeLimit', timeLimit);
                stopTimer();
                document.getElementById("timeLimitBox_").style.display = "none";
            }
        } else if (data.action === "update_players") {
            updatePlayerList(data.players);
            if (data.by_reconnect) return;
            if (Object.keys(data.players).length === 2 && !data.setting) {
                if (role_online === 'black') {
                    sendSettings();
                }
                showDialog("role", role_online);
                overlay.style.display = 'none';
                const qrPopup = document.getElementById("qr-popup");
                qrPopup.style.display = "none";
                onlineUI();
                highlightValidMoves();
                document.getElementById("restart-btn").disabled = false;
                surrenderBtn.disabled = false;
            }
            if (playerJoinSoundEnabled) {
                if (data.player_id !== playerId) {
                    playerJoin.currentTime = 0;
                    playerJoin.play().catch(error => {
                        console.warn("audio was blocked:", error);
                    });
                }
            }
            if (data.setting) {
                stopTimer();
                timeLimit = data.time_limit;
                localStorage.setItem('timeLimit', timeLimit);
                document.getElementById('timeLimitSelect').value = timeLimit;
                showValidMoves = data.show_valid_moves === "true";
                localStorage.setItem('showValidMoves', showValidMoves);
                document.getElementById('showValidMovesCheckbox').checked = showValidMoves;
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
// 降伏ボタンをクリックしたとき、確認後にサーバーへ降伏メッセージを送信
if (surrenderBtn) {
    surrenderBtn.addEventListener('click', () => {
        if (confirm(lang.surrender_right)) {
            surrenderBtn.disabled = true;
            if (sessionStorage.getItem("bot_match") === "true") {
                const tempSurrender = {
                    "action": "game_over",
                    "winner": "white",
                    "reason": "surrender",
                }
                stopTimer();
                endGame(tempSurrender, "white");
            } else {
                socket.send(JSON.stringify({ action: "surrender" }));
            }
        }
    });
    document.getElementById("info-button").addEventListener("click", function () {
        alert(`${lang.how2play_with_friend}`);
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
            if (document.getElementById("under-ad")) {
                if (!/^[a-zA-Z0-9]+$/.test(nameInput)) {
                    warning.textContent = lang.warn_EnOnly;
                    const premium2unicode = document.getElementById("premium2unicode");
                    premium2unicode.style.display = "inline-block";
                    document.getElementById("name-premium").addEventListener("click", (event) => {
                        gtag('event', 'premium_click', {
                            'event_category': 'engagement',
                            'event_label': 'premium2unicode',
                        });
                        premium2unicode.style.display = "none";
                        buyPremium(event);
                    });
                    return;
                }
            }
            playerName = profanityCleaner.clean(nameInput);
            document.getElementById("player-list").children[0].innerHTML = '<span id="p_current_circle" class="current_circle"></span> ' + lang.you + "(" + escapeHTML(playerName) + ")";
            playerName_el.value = playerName;
            localStorage.setItem("playerName", playerName);
            warning.textContent = "";
        } else {
            warning.textContent = lang.warn_charLimit;
        }
    });
}
if (document.readyState !== "loading") {
    document.removeEventListener("DOMContentLoaded", __DOMContentLoaded);
    __DOMContentLoaded();
} else {
    window.addEventListener('DOMContentLoaded', __DOMContentLoaded);
}
if (closeRoleDialogElement) {
    closeRoleDialogElement.addEventListener("click", () => {
        closeDialog("role");
    });
    document.getElementById("role-dialog-overlay").addEventListener("click", () => {
        closeDialog("role");
    });
}