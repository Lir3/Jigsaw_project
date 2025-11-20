const can = document.getElementById('can');
if (!can) console.error("Canvas element with ID 'can' not found.");
const ctx = can.getContext('2d');
let pieces = [];

let colMax = 0;
let rowMax = 0;
let pieceSize = 80;

// ピースクラス
class Piece {
    constructor(image, outline, x, y) {
        this.Image = image;
        this.Outline = outline;
        this.X = x;
        this.Y = y;
        this.OriginalCol = Math.round(x / pieceSize);
        this.OriginalRow = Math.round(y / pieceSize);
        this.IsLocked = false;

        // 拡張用プロパティ
        this.scale = 1;
        this.shadow = false;
    }

    Draw() {
        ctx.save();
        ctx.translate(this.X + pieceSize / 2, this.Y + pieceSize / 2);
        ctx.scale(this.scale, this.scale);
        ctx.translate(-pieceSize / 2, -pieceSize / 2);

        if (this.shadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 10;
        }

        ctx.drawImage(this.Image, 0, 0);
        ctx.drawImage(this.Outline, 0, 0);
        ctx.restore();
    }

    IsClick(x, y) {
        const s = pieceSize / 4;
        const width = s * 6;
        const height = s * 6;
        return x >= this.X && x <= this.X + width && y >= this.Y && y <= this.Y + height;
    }

    Check() {
        const col = Math.round(this.X / pieceSize);
        const row = Math.round(this.Y / pieceSize);
        return col === this.OriginalCol && row === this.OriginalRow;
    }
}

// --- window.onload ---
window.onload = async () => {
    if (!can) return;

    // 難易度
    const difficulty = localStorage.getItem('puzzleDifficulty') || 'normal';
    let pieceCount = 6;
    if (difficulty === 'easy') pieceCount = 4;
    else if (difficulty === 'hard') pieceCount = 8;

    // 画像読み込み
    const sourceImage = await createSourceImage();

    // サイズ調整
    const maxWidth = 480;
    const maxHeight = 480;
    const aspectRatio = sourceImage.width / sourceImage.height;
    let drawWidth, drawHeight;
    if (aspectRatio >= 1) {
        drawWidth = maxWidth;
        drawHeight = drawWidth / aspectRatio;
    } else {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
    }

    colMax = pieceCount;
    rowMax = pieceCount;
    pieceSize = Math.floor(drawWidth / colMax);
    can.width = colMax * pieceSize * 2.5;
    can.height = rowMax * pieceSize * 2;

    // リサイズ済み画像
    const resizedImage = document.createElement('canvas');
    resizedImage.width = colMax * pieceSize;
    resizedImage.height = rowMax * pieceSize;
    const rctx = resizedImage.getContext('2d');
    rctx.drawImage(sourceImage, 0, 0, resizedImage.width, resizedImage.height);

    pieces = [];
    for (let row = 0; row < rowMax; row++) {
        for (let col = 0; col < colMax; col++) {
            const image = await createPiece(resizedImage, row, col, rowMax, colMax, false);
            const outline = await createPiece(resizedImage, row, col, rowMax, colMax, true);
            pieces.push(new Piece(image, outline, col * pieceSize, row * pieceSize));
        }
    }

    shuffleInitial();
    drawAll();

    // リセットボタン
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        shuffleInitial();
        drawAll();
        time = 0;
        clearInterval(timer);
        timer = null;
        $time.innerHTML = '0 秒';
        $time.style.color = '#000';
    });

    // ヒントボタン
    const hintBtn = document.getElementById('hintBtn');
    if (hintBtn) hintBtn.addEventListener('click', () => {
        const remaining = pieces.filter(p => !p.Check());
        if (remaining.length === 0) return;
        const hintPiece = remaining[Math.floor(Math.random() * remaining.length)];
        const oldX = hintPiece.X;
        const oldY = hintPiece.Y;
        hintPiece.X = hintPiece.OriginalCol * pieceSize;
        hintPiece.Y = hintPiece.OriginalRow * pieceSize;
        drawAll();
        setTimeout(() => {
            hintPiece.X = oldX;
            hintPiece.Y = oldY;
            drawAll();
        }, 1000);
    });
};

// --- 画像関連関数 ---
async function createSourceImage() {
    const image = new Image();
    return await new Promise(resolve => {
        const uploaded = localStorage.getItem('uploadedImage');
        if (uploaded) image.src = uploaded;
        else image.src = '/static/favicon1.png';
        image.onload = () => resolve(image);
        image.onerror = () => {
            console.error("画像読み込み失敗");
            alert("画像読み込み失敗");
        };
    });
}

async function createPiece(sourceImage, row, col, rowMax, colMax, outlineOnly) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const s = pieceSize / 4;
    canvas.width = s * 6;
    canvas.height = s * 6;

    ctx.beginPath();
    ctx.moveTo(s, s);
    ctx.lineTo(s * 2, s);
    if (row > 0) ctx.arc(s * 3, s, s, Math.PI, Math.PI * 2, (row + col) % 2 === 0 ? false : true);
    ctx.lineTo(s * 5, s);
    ctx.lineTo(s * 5, s * 2);
    if (col < colMax - 1) ctx.arc(s * 5, s * 3, s, Math.PI * 3 / 2, Math.PI / 2, (row + col) % 2 === 1 ? false : true);
    ctx.lineTo(s * 5, s * 5);
    ctx.lineTo(s * 4, s * 5);
    if (row < rowMax - 1) ctx.arc(s * 3, s * 5, s, 0, Math.PI, (row + col) % 2 === 0 ? false : true);
    ctx.lineTo(s, s * 5);
    ctx.lineTo(s, s * 4);
    if (col > 0) ctx.arc(s, s * 3, s, Math.PI / 2, Math.PI * 3 / 2, (row + col) % 2 === 1 ? false : true);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;

    if (outlineOnly) ctx.stroke();
    else ctx.drawImage(sourceImage, -(col * pieceSize - s), -(row * pieceSize - s));

    const base64 = canvas.toDataURL();
    canvas.remove();
    return await createImage(base64);
}

async function createImage(base64) {
    const image = new Image();
    return await new Promise(resolve => {
        image.src = base64;
        image.onload = () => resolve(image);
    });
}

// --- シャッフル ---
function shuffleInitial() {
    if (!pieces || pieces.length === 0) return;

    const arr = [...pieces];
    const shuffleAreaStartX = colMax * pieceSize + pieceSize / 2;
    const shuffleAreaStartY = pieceSize / 2;
    const shuffleAreaWidth = can.width - shuffleAreaStartX - pieceSize;
    const shuffleAreaHeight = can.height - shuffleAreaStartY - pieceSize;

    arr.forEach(piece => {
        piece.X = shuffleAreaStartX + Math.random() * (shuffleAreaWidth - pieceSize);
        piece.Y = shuffleAreaStartY + Math.random() * (shuffleAreaHeight - pieceSize);
        piece.IsLocked = false;
        piece.scale = 1;
        piece.shadow = false;
    });
}

// --- 描画 ---
let movingPiece = null;
let oldX = 0, oldY = 0;

function drawAll() {
    ctx.clearRect(0, 0, can.width, can.height);

    let s = pieceSize / 4;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(s, s, pieceSize * colMax, pieceSize * rowMax);

    pieces.forEach(p => { if (p !== movingPiece) p.Draw(); });
    if (movingPiece) movingPiece.Draw();
}

// --- ピース操作 ---
window.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    const rect = can.getBoundingClientRect();
    const clickX = ev.clientX - rect.left;
    const clickY = ev.clientY - rect.top;

    let clickedPiece = null;
    let clickedIndex = -1;

    for (let i = pieces.length - 1; i >= 0; i--) {
        const piece = pieces[i];
        if (piece.IsClick(clickX, clickY)) {
            clickedPiece = piece;
            clickedIndex = i;
            break;
        }
    }
    if (!clickedPiece || clickedPiece.IsLocked) return;

    movingPiece = clickedPiece;
    oldX = clickedPiece.X;
    oldY = clickedPiece.Y;

    if (clickedIndex !== pieces.length - 1) {
        pieces.splice(clickedIndex, 1);
        pieces.push(movingPiece);
    }

    movingPiece.offsetX = clickX - movingPiece.X;
    movingPiece.offsetY = clickY - movingPiece.Y;

    // --- 拡大・影 ---
    movingPiece.scale = 1.1;
    movingPiece.shadow = true;

    drawAll();
});

window.addEventListener('mousemove', (ev) => {
    if (!movingPiece) return;
    const rect = can.getBoundingClientRect();
    movingPiece.X = ev.clientX - rect.left - movingPiece.offsetX;
    movingPiece.Y = ev.clientY - rect.top - movingPiece.offsetY;
    drawAll();
});

window.addEventListener('mouseup', (ev) => {
    if (!movingPiece) return;

    let col = Math.round(movingPiece.X / pieceSize);
    let row = Math.round(movingPiece.Y / pieceSize);
    const isInGoalArea = (col >= 0 && col < colMax && row >= 0 && row < rowMax);
    const targetX = col * pieceSize;
    const targetY = row * pieceSize;
    let shouldSnapAndLock = false;

    if (isInGoalArea) {
        let isOccupied = pieces.some(p => p !== movingPiece && Math.round(p.X / pieceSize) === col && Math.round(p.Y / pieceSize) === row);
        if (!isOccupied) {
            if (movingPiece.OriginalCol === col && movingPiece.OriginalRow === row) {
                movingPiece.X = targetX;
                movingPiece.Y = targetY;
                movingPiece.IsLocked = true;
                shouldSnapAndLock = true;
            } else {
                movingPiece.X = targetX;
                movingPiece.Y = targetY;
            }
        }
    }

    if (!shouldSnapAndLock) movingPiece.IsLocked = false;

    delete movingPiece.offsetX;
    delete movingPiece.offsetY;

    // --- 拡大・影を戻す ---
    movingPiece.scale = 1;
    movingPiece.shadow = false;

    movingPiece = null;

    drawAll();
    check();
});

// --- 完成チェック ---
let timer = null;
let time = 0;
let $time = document.getElementById('time');

function check() {
    let ok = pieces.every(p => p.Check());
    if (ok) {
        clearInterval(timer);
        timer = null;
        $time.style.color = '#f00';
        $time.innerHTML = `完了! ${time} 秒`;

        // 完成演出
        let jumpCount = 0;
        const jumpInterval = setInterval(() => {
            pieces.forEach(p => {
                p.Y += (jumpCount % 2 === 0 ? -10 : 10);
            });
            drawAll();
            jumpCount++;
            if (jumpCount > 5) clearInterval(jumpInterval);
        }, 100);

        setTimeout(() => {
            alert(`パズル完成！タイム: ${time} 秒`);
        }, 600);
    }
}
