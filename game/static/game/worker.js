const DIRECTION_VECTORS = [
    { dRow: 0, dCol: -1 },  // 左
    { dRow: -1, dCol: -1 },  // 左上
    { dRow: -1, dCol: 0 },  // 上
    { dRow: -1, dCol: 1 },  // 右上
    { dRow: 0, dCol: 1 },  // 右
    { dRow: 1, dCol: 1 },  // 右下
    { dRow: 1, dCol: 0 },  // 下
    { dRow: 1, dCol: -1 }   // 左下
];
// 位置をビットボード表現に変換
function positionToBit(row, col) {
    return 1n << BigInt(row * 8 + col);
}
function getFlippedDisks(blackBitboard, whiteBitboard, pos, isBlack) {
    const myBoard = isBlack ? blackBitboard : whiteBitboard;
    const opponentBoard = isBlack ? whiteBitboard : blackBitboard;
    const positionBit = positionToBit(pos.row, pos.col);

    // 既に石がある場所には置けない
    if ((myBoard | opponentBoard) & positionBit) {
        return 0n;
    }

    let flipped = 0n;

    for (const { dRow, dCol } of DIRECTION_VECTORS) {
        let r = pos.row + dRow;
        let c = pos.col + dCol;

        let flippedInDir = 0n;

        let foundOpponent = false;

        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const currentBit = positionToBit(r, c);

            if ((currentBit & opponentBoard) !== 0n) {
                flippedInDir |= currentBit;
                foundOpponent = true;
            } else if ((currentBit & myBoard) !== 0n) {
                if (foundOpponent) {
                    flipped |= flippedInDir;
                }
                break;
            } else {
                break;
            }

            r += dRow;
            c += dCol;
        }
    }

    return flipped;
}

// 有効な手の一覧を取得
function getValidMovesBitboard(blackBitboard, whiteBitboard, isBlackTurn) {
    const myBoard = isBlackTurn ? blackBitboard : whiteBitboard;
    const opponentBoard = isBlackTurn ? whiteBitboard : blackBitboard;
    const emptyBoard = ~(myBoard | opponentBoard) & 0xFFFFFFFFFFFFFFFFn;
    let validMoves = [];

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const posBit = positionToBit(row, col);
            if (emptyBoard & posBit) {
                const flipped = getFlippedDisks(blackBitboard, whiteBitboard, { row, col }, isBlackTurn);
                if (flipped !== 0n) {
                    validMoves.push({ row, col, flipped });
                }
            }
        }
    }

    return validMoves;
}

// 手を適用した後の新しいビットボードを返す
function applyMoveBitboard(blackBitboard, whiteBitboard, pos, flipped, isBlackTurn) {
    const positionBit = positionToBit(pos.row, pos.col);

    if (isBlackTurn) {
        return {
            black: blackBitboard | positionBit | flipped,
            white: whiteBitboard & ~flipped
        };
    } else {
        return {
            black: blackBitboard & ~flipped,
            white: whiteBitboard | positionBit | flipped
        };
    }
}

// ミニマックス法+アルファベータ枝刈り（ビットボード版）
function minimaxBitboard(blackBitboard, whiteBitboard, depth, isMaximizing, alpha = -Infinity, beta = Infinity) {
    // 終了条件：深さ0または終局
    if (depth <= 0) {
        return evaluateBitboard(blackBitboard, whiteBitboard);
    }

    const isBlackTurn = isMaximizing ? false : true; // AIは白=Maximizing
    const moves = getValidMovesBitboard(blackBitboard, whiteBitboard, isBlackTurn);

    // ムーブオーダリング（評価値の高い順に並べ替え）
    moves.sort((a, b) => moveWeightBitboard(b) - moveWeightBitboard(a));

    // パスの処理
    if (moves.length === 0) {
        // 相手も打てない場合はゲーム終了
        const opponentMoves = getValidMovesBitboard(blackBitboard, whiteBitboard, !isBlackTurn);
        if (opponentMoves.length === 0) {
            return finalEvaluationBitboard(blackBitboard, whiteBitboard); // 終局時の評価
        }
        // パスして相手の番
        return minimaxBitboard(blackBitboard, whiteBitboard, depth - 1, !isMaximizing, alpha, beta);
    }

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const newBitboard = applyMoveBitboard(blackBitboard, whiteBitboard, move, move.flipped, isBlackTurn);
            const score = minimaxBitboard(newBitboard.black, newBitboard.white, depth - 1, false, alpha, beta);
            maxEval = Math.max(maxEval, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) {
                break; // アルファベータ枝刈り
            }
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const newBitboard = applyMoveBitboard(blackBitboard, whiteBitboard, move, move.flipped, isBlackTurn);
            const score = minimaxBitboard(newBitboard.black, newBitboard.white, depth - 1, true, alpha, beta);
            minEval = Math.min(minEval, score);
            beta = Math.min(beta, score);
            if (beta <= alpha) {
                break; // アルファベータ枝刈り
            }
        }
        return minEval;
    }
}

// ムーブオーダリング用の重み付け関数（ビットボード版）
function moveWeightBitboard(move) {
    const r = move.row;
    const c = move.col;

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
}

// 探索深度を動的に調整する関数
function adjustSearchDepth(estimatedTime, aiLevel) {
    if (estimatedTime < (aiLevel * 200)) {
        minimax_depth++;
    } else if (estimatedTime > aiLevel * 400) {
        minimax_depth--;
        if (estimatedTime > aiLevel * 700) {
            minimax_depth--;
        }
    }
    if (minimax_depth > aiLevel) {
        minimax_depth = aiLevel;
    }
    if (minimax_depth < 0) {
        minimax_depth = 0;
    }
}

// 石の数をカウント
function countBits(bits) {
    let count = 0n;
    let value = bits;

    while (value) {
        count++;
        value &= value - 1n; // 最下位の1ビットをクリア
    }

    return Number(count);
}

// 終局時の評価（ビットボード版）
function finalEvaluationBitboard(blackBitboard, whiteBitboard) {
    const blackCount = countBits(blackBitboard);
    const whiteCount = countBits(whiteBitboard);

    return (whiteCount - blackCount) * 1000;
}

// 盤面の評価関数（ビットボード版）
function evaluateBitboard(blackBitboard, whiteBitboard) {
    let blackScore = 0;
    let whiteScore = 0;

    // 石の数をカウント
    const blackCount = countBits(blackBitboard);
    const whiteCount = countBits(whiteBitboard);
    const totalStones = blackCount + whiteCount;

    // ゲームフェーズに応じて戦略を変更
    const gamePhase = totalStones / 64; // 0～1の範囲

    // 石の数の重み（終盤ほど重要に）
    const stoneCountWeight = gamePhase * 2 + 0.1;
    blackScore += blackCount * stoneCountWeight;
    whiteScore += whiteCount * stoneCountWeight;

    // 角の制御（ビットマスクを使用して高速化）
    const blackCorners = countBits(blackBitboard & CORNER_MASK);
    const whiteCorners = countBits(whiteBitboard & CORNER_MASK);
    blackScore += blackCorners * cornerWeight;
    whiteScore += whiteCorners * cornerWeight;

    // 辺の評価（ビットマスクを使用して高速化）
    const blackEdges = countBits(blackBitboard & EDGE_MASK);
    const whiteEdges = countBits(whiteBitboard & EDGE_MASK);
    blackScore += blackEdges * edgeWeight;
    whiteScore += whiteEdges * edgeWeight;

    // 危険な位置（XCセル）のペナルティ
    // XCセルのペナルティはゲームの初期〜中盤で特に重要
    const xcPenaltyMultiplier = Math.max(0, 1 - gamePhase * 1.1); // ゲーム終盤に向けて減少

    // 各角に対するXCセルとその角の状態を評価
    const corners = [
        { corner: 0x0000000000000001n, xc: 0x0000000000000202n },
        { corner: 0x0000000000000080n, xc: 0x0000000000004000n },
        { corner: 0x0100000000000000n, xc: 0x0200000000000000n },
        { corner: 0x8000000000000000n, xc: 0x4040000000000000n }
    ];

    for (const { corner, xc } of corners) {
        // 角が空いている場合
        if ((blackBitboard & corner) === 0n && (whiteBitboard & corner) === 0n) {
            blackScore -= countBits(blackBitboard & xc) * xcCellPenalty * xcPenaltyMultiplier;
            whiteScore -= countBits(whiteBitboard & xc) * xcCellPenalty * xcPenaltyMultiplier;
        } else if (blackBitboard & corner) {
            whiteScore -= countBits(whiteBitboard & xc) * xcCellPenalty * 0.8 * xcPenaltyMultiplier;
        } else if (whiteBitboard & corner) {
            blackScore -= countBits(blackBitboard & xc) * xcCellPenalty * 0.8 * xcPenaltyMultiplier;
        }
    }

    // 機動力（有効手の数）の評価（序盤〜中盤で重要）
    if (gamePhase < 0.7) {
        const mobilityMultiplier = (1 - gamePhase) * mobilityWeight;

        const blackMobility = getValidMovesBitboard(blackBitboard, whiteBitboard, true).length;
        const whiteMobility = getValidMovesBitboard(blackBitboard, whiteBitboard, false).length;
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

// 角のビットマスク
const CORNER_MASK = 0x8100000000000081n;
// 辺のビットマスク
const EDGE_MASK = 0x7E8181818181817En;

// 角・辺・XCセル用の重み定数
const cornerWeight = 30;
const edgeWeight = 5;
const xcCellPenalty = 7;

let aiLevel = 5; //仮の値
let minimax_depth = 3; //仮の値
let mobilityWeight = 0.1; //仮の値

onmessage = (e) => {
    let message = [];
    const [_bitboard, _minimax_depth, _aiLevel] = e.data;
    aiLevel = _aiLevel;
    mobilityWeight = aiLevel > 5 ? 0.3 : 0.1;
    minimax_depth = _minimax_depth;
    const validMoves = getValidMovesBitboard(_bitboard.black, _bitboard.white, false);
    const startTime = performance.now();
    let bestScore = -Infinity;
    for (let i = 0; i < validMoves.length; i++) {
        const move = validMoves[i];
        const newBitboard = applyMoveBitboard(_bitboard.black, _bitboard.white, move, move.flipped, false);
        const score = minimaxBitboard(newBitboard.black, newBitboard.white, minimax_depth, false, -Infinity, Infinity);
        if (score > bestScore) {
            bestScore = score;
            message = [move.row, move.col];
        }
        if (i === Math.floor(validMoves.length / 2)) {
            const midTime = performance.now();
            adjustSearchDepth((midTime - startTime) * 2, aiLevel);
        }
    }
    postMessage(message);
};