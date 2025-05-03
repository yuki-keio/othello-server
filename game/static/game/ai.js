
let wasmEvaluate = null;
let wasmReady = false;
function loadWasmModule() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/static/game/othello_wasm.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Wasm script load failed'));
        document.head.appendChild(script);
    });
}

async function initWasm() {
    await loadWasmModule();
    const Module = await OthelloModule();
    wasmEvaluate = Module.evaluateBoard;
    wasmReady = true;
}

initWasm().catch(err => console.error(err));

export function startAIMove() {
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
// AIの手を決定する関数
function aiMakeMove() {
    const startTime = performance.now();

    let bestMove = null;
    let bestScore = -Infinity;
    const initialBoard = gameBoard.map(row => [...row]);
    const validMoves = hasValidMove();
    // 全ての有効な手を探索
    for (let i = 0; i < validMoves.length; i++) {
        const [row, col] = validMoves[i];
        const tempBoard = applyMoveToBoard(initialBoard, row, col, currentPlayer);
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

    // ムーブオーダリングの実装
    const moveWeight = ([r, c]) => {
        // 隅 (A1, A8, H1, H8)
        if ((r === 0 && c === 0) || (r === 7 && c === 0) || (r === 0 && c === 7) || (r === 7 && c === 7)) return 1000;
        // B打ち (A3, A6, C1, C8, F1, F8, H3, F6)
        if ((r === 2 && c === 0) || (r === 5 && c === 0) ||
            (r === 0 && c === 2) || (r === 7 && c === 2) ||
            (r === 0 && c === 5) || (r === 7 && c === 5) ||
            (r === 2 && c === 7) || (r === 5 && c === 7)) return 900;
        // A打ち (A4, A5, D1, D8, E1, E8, H4, H5)
        if ((r === 3 && c === 0) || (r === 4 && c === 0) ||
            (r === 0 && c === 3) || (r === 7 && c === 3) ||
            (r === 0 && c === 4) || (r === 7 && c === 4) ||
            (r === 3 && c === 7) || (r === 4 && c === 7)) return 800;
        // ボックス隅 (C3, C6, F3, F6)
        if ((r === 2 && c === 2) || (r === 2 && c === 5) ||
            (r === 5 && c === 2) || (r === 5 && c === 5)) return 700;
        // ボックス辺 (C4, C5, D3, D6, E3, E6, F4, F5)
        if ((r === 2 && c === 3) || (r === 2 && c === 4) ||
            (r === 3 && c === 2) || (r === 4 && c === 2) ||
            (r === 5 && c === 3) || (r === 5 && c === 4) ||
            (r === 3 && c === 5) || (r === 4 && c === 5)) return 600;
        // 中辺 (B3, B4, B5, B6, C2, C7, D2, D7, E2, E7, F2, F7, G3, G4, G5, G6)
        if ((r === 2 && c === 1) || (r === 3 && c === 1) || (r === 4 && c === 1) || (r === 5 && c === 1) ||
            (r === 1 && c === 2) || (r === 6 && c === 2) ||
            (r === 1 && c === 3) || (r === 6 && c === 3) ||
            (r === 1 && c === 4) || (r === 6 && c === 4) ||
            (r === 1 && c === 5) || (r === 6 && c === 5) ||
            (r === 2 && c === 6) || (r === 3 && c === 6) || (r === 4 && c === 6) || (r === 5 && c === 6)) return 500;
        // C打ち (A2, A7, B1, B8, G1, G8, H2, H7)
        if ((r === 1 && c === 0) || (r === 6 && c === 0) ||
            (r === 0 && c === 1) || (r === 7 && c === 1) ||
            (r === 0 && c === 6) || (r === 7 && c === 6) ||
            (r === 1 && c === 7) || (r === 6 && c === 7)) return 400;
        // X打ち (B2, B7, G2, G7)
        if ((r === 1 && c === 1) || (r === 6 && c === 1) ||
            (r === 1 && c === 6) || (r === 6 && c === 6)) return 300;
        return 0;
    };
    validMoves.sort((a, b) => moveWeight(b) - moveWeight(a));

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
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const [row, col] of validMoves) {
            // 試行的に手を適用
            const newBoard = applyMoveToBoard(board, row, col, player);
            // 再帰的に評価
            const score = minimax(newBoard, depth - 1, false, alpha, beta);
            maxEval = Math.max(maxEval, score);
            alpha = Math.max(alpha, score);
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
            const newBoard = applyMoveToBoard(board, row, col, player);
            // 再帰的に評価
            const score = minimax(newBoard, depth - 1, true, alpha, beta);
            minEval = Math.min(minEval, score);
            beta = Math.min(beta, score);
            // アルファベータ枝刈り
            if (beta <= alpha) {
                break;
            }
        }
        return minEval;
    }
}
// 探索深度を動的に調整する関数
function adjustSearchDepth(estimatedTime, aiLevel) {
    if (estimatedTime < (aiLevel * 300)) {
        minimax_depth++;
    } else if (estimatedTime > aiLevel * 400) {
        minimax_depth--;
        if (estimatedTime > aiLevel * 700) {
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
// 終局時の評価
function finalEvaluation(board) {
    const blackCount = board.flat().filter(cell => cell === 'black').length;
    const whiteCount = board.flat().filter(cell => cell === 'white').length;

    return (whiteCount - blackCount) * 1000;
}
// 盤面の評価関数
function evaluateBoard(board) {
    if (wasmReady) {
        const result = wasmEvaluate(board, aiLevel);
        console.log("WASM result:", result);
        return result;
    }
    if (window.OthelloWasmModule) {
        try {
            return window.OthelloWasmModule.evaluateBoard(board, aiLevel);
        } catch (e) {
            console.warn("Error in WASM evaluation:", e);
        }
    }
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
            // 「最弱級」指定のAI。評価関数は敢えて反転させる
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
// 特定の盤面に対する有効な手を取得する関数
function getValidMovesForBoard(board, player) {
    const validMoves = [];
    const opponent = player === "black" ? "white" : "black";
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (board[row][col] !== '') continue;
            // この位置に石を置いたときに、相手の石を裏返せるか確認
            for (const [dx, dy] of DIRECTIONS) {
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

function applyMoveToBoard(board, row, col, player) {
    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = player;
    for (const [dx, dy] of DIRECTIONS) {
        const flipped = getFlippedStones(newBoard, row, col, dx, dy, player);
        for (const [x, y] of flipped) {
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
export function initAIMode() {
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
            if (option.getAttribute("data-level")) {
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