#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <vector>
#include <string>
#include <cmath>
#include <algorithm>

using namespace emscripten;

// 8x8のオセロボードを表現するクラス
class Board {
private:
    // 0: 空, 1: 黒, 2: 白
    std::vector<std::vector<int>> cells;
    const std::vector<std::pair<int, int>> DIRECTIONS = {
        {-1, -1}, {-1, 0}, {-1, 1},
        {0, -1},           {0, 1},
        {1, -1},  {1, 0},  {1, 1}
    };

public:
    // コンストラクタ - 8x8の空のボードを初期化
    Board() : cells(8, std::vector<int>(8, 0)) {}

    // JavaScriptの2次元配列からボードを初期化
    void setBoard(const val& jsBoard) {
        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                std::string cell = jsBoard[row][col].as<std::string>();
                if (cell == "black") {
                    cells[row][col] = 1;
                } else if (cell == "white") {
                    cells[row][col] = 2;
                } else {
                    cells[row][col] = 0;
                }
            }
        }
    }

    // 有効な座標かどうかのチェック
    bool isValidPosition(int row, int col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    // 相手の色を取得
    int getOpponentColor(int color) {
        return (color == 1) ? 2 : 1;
    }

    // 最も近い角の座標を返す
    std::pair<int, int> getNearestCorner(int row, int col) {
        if (row <= 3) {
            if (col <= 3) return {0, 0};
            return {0, 7};
        } else {
            if (col <= 3) return {7, 0};
            return {7, 7};
        }
    }

    // 特定のプレイヤーの有効な手を取得
    std::vector<std::pair<int, int>> getValidMoves(int player) {
        std::vector<std::pair<int, int>> validMoves;
        int opponent = getOpponentColor(player);

        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                if (cells[row][col] != 0) continue;

                bool isValid = false;
                for (auto& dir : DIRECTIONS) {
                    int dx = dir.first, dy = dir.second;
                    int x = row + dx, y = col + dy;
                    bool hasOpponent = false;

                    while (isValidPosition(x, y) && cells[x][y] == opponent) {
                        hasOpponent = true;
                        x += dx;
                        y += dy;
                    }

                    if (hasOpponent && isValidPosition(x, y) && cells[x][y] == player) {
                        isValid = true;
                        break;
                    }
                }

                if (isValid) {
                    validMoves.push_back({row, col});
                }
            }
        }
        return validMoves;
    }

    // 終局時の評価（石の数の差）
    int finalEvaluation() {
        int blackCount = 0;
        int whiteCount = 0;

        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                if (cells[row][col] == 1) {
                    blackCount++;
                } else if (cells[row][col] == 2) {
                    whiteCount++;
                }
            }
        }

        return (whiteCount - blackCount) * 1000;
    }

    // ボードの評価関数（JavaScript版と同じロジック）
    int evaluateBoard(int aiLevel) {
        // 重み定数
        const int cornerWeight = 30;     // 角の重み
        const int edgeWeight = 5;        // 辺の重み
        const float mobilityWeight = 0.2f;  // 機動力の重み
        const int xcCellPenalty = 7;     // XCセルのペナルティ

        int blackScore = 0;
        int whiteScore = 0;

        // 石の数をカウント
        int blackCount = 0;
        int whiteCount = 0;

        for (int row = 0; row < 8; row++) {
            for (int col = 0; col < 8; col++) {
                if (cells[row][col] == 1) {
                    blackCount++;
                } else if (cells[row][col] == 2) {
                    whiteCount++;
                }
            }
        }

        int totalStones = blackCount + whiteCount;

        // 終局状態の特別処理
        if (totalStones == 64) {
            return (whiteCount - blackCount) * 1000;
        }

        // ゲームフェーズに応じて戦略を変更
        const float gamePhase = static_cast<float>(totalStones) / 64.0f; // 0～1の範囲

        // 石の数の重み（終盤ほど重要に）
        const float stoneCountWeight = gamePhase * 2.0f + 0.1f;
        blackScore += static_cast<int>(blackCount * stoneCountWeight);
        whiteScore += static_cast<int>(whiteCount * stoneCountWeight);

        // 角の制御
        const std::vector<std::pair<int, int>> corners = {{0, 0}, {0, 7}, {7, 0}, {7, 7}};
        for (const auto& corner : corners) {
            int row = corner.first, col = corner.second;
            if (cells[row][col] == 1) blackScore += cornerWeight;
            else if (cells[row][col] == 2) whiteScore += cornerWeight;
        }

        // 辺の評価
        std::vector<std::pair<int, int>> edges;
        for (int i = 2; i <= 5; i++) {
            edges.push_back({0, i});  // 上辺
            edges.push_back({7, i});  // 下辺
            edges.push_back({i, 0});  // 左辺
            edges.push_back({i, 7});  // 右辺
        }
        
        for (const auto& edge : edges) {
            int row = edge.first, col = edge.second;
            if (cells[row][col] == 1) blackScore += edgeWeight;
            else if (cells[row][col] == 2) whiteScore += edgeWeight;
        }

        // 危険な位置（XCセル）のペナルティ
        const std::vector<std::pair<int, int>> dangerPositions = {{1, 1}, {1, 6}, {6, 1}, {6, 6}};
        for (const auto& danger : dangerPositions) {
            int row = danger.first, col = danger.second;
            auto nearCorner = getNearestCorner(row, col);
            int cornerState = cells[nearCorner.first][nearCorner.second];

            // XCセルのペナルティはゲームの初期〜中盤で特に重要
            const float xcPenaltyMultiplier = std::max(0.0f, 1.0f - gamePhase * 1.1f); // ゲーム終盤に向けて減少

            // 角が空の場合は最大のペナルティ
            if (cornerState == 0) {
                if (cells[row][col] == 1) blackScore -= static_cast<int>(xcCellPenalty * xcPenaltyMultiplier);
                if (cells[row][col] == 2) whiteScore -= static_cast<int>(xcCellPenalty * xcPenaltyMultiplier);
            }
            // 角が相手の石の場合も高いペナルティ
            else if ((cornerState == 2 && cells[row][col] == 1) ||
                     (cornerState == 1 && cells[row][col] == 2)) {
                if (cells[row][col] == 1) blackScore -= static_cast<int>(xcCellPenalty * 0.8f * xcPenaltyMultiplier);
                if (cells[row][col] == 2) whiteScore -= static_cast<int>(xcCellPenalty * 0.8f * xcPenaltyMultiplier);
            }
            // 角が自分の石なら、XCセルは比較的安全
            // この場合はペナルティなし
        }

        // 機動力（有効手の数）の評価（序盤〜中盤で重要）
        if (gamePhase < 0.7f) {
            const float mobilityMultiplier = (1.0f - gamePhase) * mobilityWeight;
            const int blackMobility = static_cast<int>(getValidMoves(1).size());
            const int whiteMobility = static_cast<int>(getValidMoves(2).size());

            blackScore += static_cast<int>(blackMobility * mobilityMultiplier);
            whiteScore += static_cast<int>(whiteMobility * mobilityMultiplier);
        }

        // AIレベルに応じた評価戦略
        if (aiLevel > 1) {
            if (aiLevel == 6) {
                // 「最弱級」指定のAI。評価関数は敢えて反転させる
                return blackScore - whiteScore;
            }
            return whiteScore - blackScore;
        } else {
            return whiteCount - blackCount;
        }
    }
};

// JavaScript側からC++関数を呼び出すためのラッパー関数
int evaluateBoard(val jsBoard, int aiLevel) {
    Board board;
    board.setBoard(jsBoard);
    return board.evaluateBoard(aiLevel);
}

// WebAssemblyにエクスポートする関数の登録
EMSCRIPTEN_BINDINGS(othello_module) {
    function("evaluateBoard", &evaluateBoard);
}