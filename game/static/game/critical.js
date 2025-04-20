const board = document.getElementById('board');
const statusB = document.getElementById('status');
const scoreB = document.getElementById('score_black');
const scoreW = document.getElementById('score_white');
const turnDisplay = document.getElementById('turn_display');
const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];

let gameBoard = Array.from({ length: 8 }, () => Array(8).fill(''));
let currentPlayer = 'black';

let showValidMoves = !(localStorage.getItem('showValidMoves') === "false");
let timeLimit = parseInt(localStorage.getItem('timeLimit') || 0);
let aiLevel = parseInt(localStorage.getItem('aiLevel') || 1);

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

function setInitialStones() {
    setDisc(3, 3, 'white');
    setDisc(3, 4, 'black');
    setDisc(4, 3, 'black');
    setDisc(4, 4, 'white');
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
    document.getElementById('b_loader').style.display = 'none';
}

function updateStatus() {
    const blackCount = gameBoard.flat().filter(cell => cell === 'black').length;
    const whiteCount = gameBoard.flat().filter(cell => cell === 'white').length;
    scoreB.textContent = blackCount;
    scoreW.textContent = whiteCount;

    if (currentPlayer === 'black') {
        turnDisplay.textContent = '（黒番）';
    } else {
        turnDisplay.textContent = '（白番）';
    }
}


function initializeBoard() {
    refreshBoard();
    if (!loadBoardFromURL()) {
        setInitialStones();
    }
    add4x4Markers();
    updateStatus();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeBoard();
});


