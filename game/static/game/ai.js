const aiworker = new Worker(workerPath);

export function startAIMove() {
    aimove = true;
    stopTimer();
    // 「考え中」のログを表示
    const timerDisplay_ = document.getElementById('timer-display');

    timerDisplay_.classList.remove('warning1', 'warning2');

    timerDisplay_.style.display = 'inline-block'; // 表示
    const timerPrefix = aiLevel === 6 ? "🐤 " : aiLevel === 9 ? "👺 " : aiLevel === 7 ? "🔆 " : aiLevel > 9 ? "🌈 " : "🤔 ";
    timerDisplay_.textContent = timerPrefix + lang.thinking;
    board.classList.add('thinking');
    setTimeout(() => {
        updateStatus();
        aiMakeMove();
        updateURL();
    }, 10);
    const aiThinkingTimer = setInterval(() => {
        if (!aimove) {
            clearInterval(aiThinkingTimer);
            return;
        } else if (timerDisplay_.textContent === timerPrefix + lang.thinking) {
            timerDisplay_.textContent = timerPrefix + lang.thinking + ".";
        } else if (timerDisplay_.textContent === timerPrefix + lang.thinking + ".") {
            timerDisplay_.textContent = timerPrefix + lang.thinking + "..";
        } else if (timerDisplay_.textContent === timerPrefix + lang.thinking + "..") {
            timerDisplay_.textContent = timerPrefix + lang.thinking + "...";
        } else if (timerDisplay_.textContent === timerPrefix + lang.thinking + "...") {
            timerDisplay_.textContent = timerPrefix + lang.thinking;
        }
    }, 700);
}

function positionToBit(row, col) {
    return 1n << BigInt(row * 8 + col);
}
function boardToBitboard(board) {
    let blackBitboard = 0n;
    let whiteBitboard = 0n;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const bit = positionToBit(row, col);
            if (board[row][col] === 'black') {
                blackBitboard |= bit;
            } else if (board[row][col] === 'white') {
                whiteBitboard |= bit;
            }
        }
    }
    return { black: blackBitboard, white: whiteBitboard };
}

function aiMakeMove() {
    const initialBoard = gameBoard.map(row => [...row]);
    const bitboard = boardToBitboard(initialBoard);
    aiworker.postMessage([
            bitboard,
            minimax_depth,
            aiLevel
        ]);
}

function endMove(bestMove, timeLimit, gameEnded, fromAI) {
    if (bestMove.row !== null) {
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

export function initAIMode() {
    const aiLevelSelect = document.getElementById('aiLevelSelect');
    const popup = document.getElementById('ai-level-popup');
    document.getElementById("ai-level-display").addEventListener("click", function () {
        popup.style.display = popup.style.display !== 'block' ? 'block' : 'none';
        localStorage.setItem('aiLevel', aiLevelSelect.value);
        aiLevel = aiLevelSelect.value;
        minimax_depth = Math.min(aiLevel - 4, 8);
        if (minimax_depth < 0) {
            minimax_depth = 0;
        }
        updateAiLevelDisplay();
    });
    // 保存されたAIレベル解放状況を確認
    const unlockedLevels = JSON.parse(localStorage.getItem('unlockedAiLevels') || '{"0":true,"1":true,"2":true,"6":true}');
    console.log(`[aiLevelSelect] Unlocked levels: ${JSON.stringify(unlockedLevels)}`);
    const maxKey = Math.max(...Object.keys(unlockedLevels).map(Number));
    if (maxKey >= 9) {
        const aiLevelList = document.getElementById('ai-level-list');
        // 9以上のレベルはhtmlにoptionがないので、追加していく
        for (let i = 11; i <= maxKey + 2; i += 2) {
            const newOption = document.createElement('option');
            const newDiv = document.createElement('div');

            newOption.value = i;
            newOption.setAttribute('data-unlock-level', i - 2);
            newOption.className = 'locked-level';

            if (i === 11) {
                newOption.textContent = `🌈 ${lang.legend}`;
                newDiv.textContent = `🌈 ${lang.legend}`;
            } else {
                newOption.textContent = `🌈 ${lang.legend} ${(i - 9) / 2}`;
                newDiv.textContent = `🌈 ${lang.legend} ${(i - 9) / 2}`;
            }

            newDiv.className = 'ai-level-item locked-level';
            newDiv.setAttribute('data-level', i);
            newDiv.setAttribute('data-unlock-level', i - 2);

            aiLevelSelect.insertBefore(newOption, aiLevelSelect.lastChild);
            aiLevelList.insertBefore(newDiv, aiLevelList.lastChild);
        }
        if (Object.keys(unlockedLevels).length === 8) {
            langNextAIName = `🌈 ${lang.legend}`;
        } else {
            langNextAIName = `🌈 ${lang.legend} ${(maxKey - 7) / 2}`;
        }
    }
    // ロックされたレベルを処理
    const lockedOptions = document.querySelectorAll('.locked-level');
    lockedOptions.forEach(option => {
        const unlockLevel = option.getAttribute('data-unlock-level')
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
                    if (unlockLevel >= 9 && !authenticated) {
                        option.innerHTML = `<a href="/en/signup/">Sign up</a> to unlock the next level`;
                    } else {
                        option.textContent = `Next Level: Defeat ${level_before.textContent} to unlock`;
                    }
                    break;
                default:
                    if (unlockLevel >= 9 && !authenticated) {
                        option.innerHTML = `次のレベル : <a href="/signup/">アカウントを登録</a>して解放`;
                    } else {
                        option.textContent = `次のレベル : ${level_before.textContent}AIに勝利で解放`;
                    }
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
        const currentNumber = Number(currentLevel);
        if (nextLevelOption) {
            const nextLevel = nextLevelOption.value;
            unlockedLevels[nextLevel] = true;
            localStorage.setItem('unlockedAiLevels', JSON.stringify(unlockedLevels));
            document.getElementById('restart-match').textContent = lang.nextLevel;
            localStorage.setItem('aiLevel', nextLevel);
        } else if (currentNumber >= 9) {
            const maxUnlockedLevel = Math.max(...Object.keys(unlockedLevels).map(Number));
            if (maxUnlockedLevel !== currentNumber) {
                return;
            }
            const nextLevel = currentNumber + 2;
            unlockedLevels[nextLevel] = true;
            localStorage.setItem('unlockedAiLevels', JSON.stringify(unlockedLevels));
            document.getElementById('restart-match').textContent = lang.nextLevel;
            localStorage.setItem('aiLevel', nextLevel);
        }
    };
    window.congratsNextAiLevel = function (currentLevel) {
        const nextLevelOption = Array.from(aiLevelSelect.querySelectorAll('.locked-level')).find(
            option => option.getAttribute('data-unlock-level') == currentLevel
        );
        const largestUnlockedLevel = Math.max(...Object.keys(unlockedLevels).map(Number));
        // 解放メッセージを表示
        if (nextLevelOption || ((currentLevel > 9)) && largestUnlockedLevel === currentLevel) {
            if (Number(currentLevel) === 9) {
                if (largestUnlockedLevel === 11) {
                    alert(lang.signupToUnlockLegend);
                    document.getElementById('menu-toggle').checked = true;
                }
            } else {
                alert(lang.congrats_aiLevel_unlocked_b + langNextAIName + lang.congrats_aiLevel_unlocked_a);
            }

        }
    }

    // AIレベル表示の更新関数
    function updateAiLevelDisplay() {
        const displayEl = document.getElementById('ai-level-display');
        aiLevelSelect.value = aiLevel;
        try {
            displayEl.textContent = aiLevelSelect.options[aiLevelSelect.selectedIndex].text + (aiLevel > 9 ? "" : " AI");
        }
        catch (e) {
            displayEl.textContent = `🌙 Level ${aiLevel}`;
            console.warn("隠しレベル | error:", e);
        }

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
            popup.style.display = 'none';
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
        const displayEl_ = document.getElementById('ai-level-display');
        if (popup.style.display === 'block' && !popup.contains(e.target) && e.target !== displayEl_) {
            popup.style.display = 'none';
        }
    });
    aiLevelSelect.addEventListener('change', updateAiLevelDisplay);
    // 初期表示を設定
    setTimeout(updateAiLevelDisplay, 100);
}

aiworker.onmessage = function (workerBestMove) {
    let updatedDepth;
    let bestMove = { row: null, col: null };
    [bestMove.row, bestMove.col, updatedDepth] = workerBestMove.data;
    minimax_depth = updatedDepth;
    console.log(`AI Move:${bestMove}, Depth:${minimax_depth}`);
    if (aiLevel < 4) {
        setTimeout(() => endMove(bestMove, timeLimit, gameEnded, aimove), 600);
    } else if (aiLevel < 7) {
        setTimeout(() => endMove(bestMove, timeLimit, gameEnded, aimove), 300);
    } else {
        endMove(bestMove, timeLimit, gameEnded, aimove);
    }
};
aiworker.onerror = function (error) {
    console.error('Error in AI worker:', error.message);
}