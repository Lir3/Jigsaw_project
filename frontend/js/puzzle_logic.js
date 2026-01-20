const can = document.getElementById('can');
if (!can) console.error("Canvas element with ID 'can' not found.");
const ctx = can.getContext('2d');

let pieces = [];
let colMax = 0;
let rowMax = 0;
let pieceSize = 80;

// ★ View State (Zoom/Pan)
let view = {
    x: 0,
    y: 0,
    scale: 1.0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartViewX: 0,
    panStartViewY: 0
};

// 座標変換ヘルパー
function toWorld(screenX, screenY) {
    return {
        x: (screenX - view.x) / view.scale,
        y: (screenY - view.y) / view.scale
    };
}

// DB連携 (single_play.js) からアクセスされるグローバル変数
let timer = null;
let time = 0; // 経過時間
let isGameCompleted = false; // クリアフラグ
const $time = document.getElementById('time'); // HTML要素
const $status = document.getElementById('status-msg'); // HTML要素 (single_play.jsで使用)

// 外部からのズーム操作用
function zoomIn() {
    view.scale = Math.min(view.scale * 1.2, 5.0);
    // Center Zoom currently focuses on top-left or whatever. Ideally center screen.
    // For simplicity, center zoom:
    // view.x = centerX - (centerX - view.x) * ratio... 
    // Manual inputs usually expect center screen zoom.
    adjustZoomCenter(1.2);
}

function zoomOut() {
    view.scale = Math.max(view.scale / 1.2, 0.1);
    adjustZoomCenter(1 / 1.2);
}

// Hint Functionality
function useHint() {
    if (!pieces || pieces.length === 0) return;
    if (isGameCompleted) return;

    // Find a piece that is NOT locked
    const loosePieces = pieces.filter(p => !p.IsLocked);
    if (loosePieces.length === 0) return;

    // Randomly select one
    const p = loosePieces[Math.floor(Math.random() * loosePieces.length)];

    // Snap to correct position immediately
    snapGroupToBoard(p); // This locks it

    // Fix Rotation
    p.Rotation = 0;
    p.visualRotation = 0;
    p.group.forEach(g => {
        g.Rotation = 0;
        g.visualRotation = 0;
    });

    // Effect? Maybe flash it (TODO)
    drawAll();
    check();
}

// ヒントボタンのイベントリスナー設定 (Called from play.html/multi_play.html)
function setupHintButton() {
    const hintBtn = document.getElementById('hintBtn');
    if (hintBtn) {
        // Use onclick to prevent multiple listeners accumulation
        hintBtn.onclick = () => {
            useHint();
        };
    }
}

function adjustZoomCenter(ratio) {
    const cx = can.width / 2;
    const cy = can.height / 2;
    // World pos of center
    const wx = (cx - view.x) / (view.scale / ratio); // old scale
    const wy = (cy - view.y) / (view.scale / ratio);

    // New view pos
    view.x = cx - wx * view.scale;
    view.y = cy - wy * view.scale;
}

// ピースクラス
// ピースクラス（グルーピング＋回転対応版）
class Piece {
    // 5番目の引数 "originalIndex" を追加
    constructor(image, outline, x, y, originalIndex) {
        this.Image = image;
        this.Outline = outline;
        this.X = x;
        this.Y = y;

        // ★重要：受け取った値をプロパティとして保存
        this.originalIndex = originalIndex;

        this.OriginalCol = Math.round(x / pieceSize);
        this.OriginalRow = Math.round(y / pieceSize);
        this.IsLocked = false;

        this.group = [this]; // グループ（小文字）
        this.scale = 1;
        this.shadow = false;

        this.Rotation = 0; // 回転（大文字）
        this.visualRotation = 0; // ★表示用の回転角度 (補間用)
        this.startX = 0;
        this.startY = 0;

        // 他人が操作中かどうかのフラグ
        this.isHeldByOther = false;
    }

    Draw() {
        ctx.save();
        ctx.translate(this.X + pieceSize / 2, this.Y + pieceSize / 2);
        ctx.scale(this.scale, this.scale);

        // ★補間された角度を使用
        const rad = this.visualRotation * 90 * Math.PI / 180;
        ctx.rotate(rad);

        // Image is 1.5x pieceSize (s*6 vs s*4). Center is at 0.75*pieceSize.
        // We want to center the image on the rotation pivot (which is the center of the grid cell).
        ctx.translate(-pieceSize * 0.75, -pieceSize * 0.75);

        if (this.shadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
        }

        ctx.drawImage(this.Image, 0, 0);
        ctx.drawImage(this.Outline, 0, 0);
        ctx.restore();
    }
    // ... (IsClick, Check, startTimer, initPuzzle methods remain similar but condensed for replacement) ...
    IsClick(x, y) {
        const centerX = this.X + pieceSize / 2;
        const centerY = this.Y + pieceSize / 2;
        return Math.hypot(x - centerX, y - centerY) < pieceSize * 0.8;
    }

    Check() {
        const col = Math.round(this.X / pieceSize);
        const row = Math.round(this.Y / pieceSize);
        return col === this.OriginalCol && row === this.OriginalRow && this.Rotation === 0;
    }
}

// タイマー開始関数
function startTimer() {
    if (timer) clearInterval(timer);
    $time.innerHTML = `${time}`;
    $time.style.color = ''; // CSSに任せる
    timer = setInterval(() => {
        time++;
        $time.innerHTML = `${time}`;
    }, 1000);
}

function stopTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

async function initPuzzle(imageUrl, savedPiecesData, difficultyArg) {
    if (!can) return;

    // 難易度 (引数優先 -> LocalStorage -> Default)
    // 難易度 (引数優先 -> LocalStorage -> Default)
    const difficulty = difficultyArg || localStorage.getItem('puzzleDifficulty') || 'normal';

    let basePieceCount = 6; // 短い辺の基準分割数

    // Check if difficulty is a number (from slider)
    if (!isNaN(difficulty)) {
        basePieceCount = parseInt(difficulty, 10);
    } else {
        if (difficulty === 'easy') basePieceCount = 4;
        else if (difficulty === 'hard') basePieceCount = 8;
        else if (difficulty === 'expert') basePieceCount = 10;
        else basePieceCount = 6; // normal
    }

    // 画像読み込み
    const sourceImage = await createSourceImage(imageUrl);

    // 1. 画像の縦横比と最大表示サイズの設定
    const maxWidth = 480;
    const maxHeight = 480;
    const aspectRatio = sourceImage.width / sourceImage.height;

    // 表示するパズルエリアのサイズを決定
    let drawWidth, drawHeight;
    if (aspectRatio >= 1) { // 横長または正方形
        drawWidth = maxWidth;
        drawHeight = drawWidth / aspectRatio;
    } else { // 縦長
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
    }

    // 2. 縦横比に基づいた分割数とピースサイズの決定
    if (aspectRatio >= 1) {
        rowMax = basePieceCount;
        colMax = Math.round(rowMax * aspectRatio);
    } else {
        colMax = basePieceCount;
        rowMax = Math.round(colMax / aspectRatio);
    }

    // pieceSize (ピースの1辺のサイズ) を決定
    pieceSize = Math.floor(drawWidth / colMax);

    // 3. キャンバスのサイズをウィンドウサイズに合わせる
    const puzzleAreaWidth = colMax * pieceSize;
    const puzzleAreaHeight = rowMax * pieceSize;

    // Canvas Fullscreen
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initial View Centering
    view.scale = Math.min(
        (can.width * 0.8) / puzzleAreaWidth,
        (can.height * 0.8) / puzzleAreaHeight
    );
    // Clamp initial scale
    if (view.scale > 1.2) view.scale = 1.2;
    if (view.scale < 0.5) view.scale = 0.5;

    view.x = (can.width - puzzleAreaWidth * view.scale) / 2;
    view.y = (can.height - puzzleAreaHeight * view.scale) / 2;

    // 4. 完成図の表示
    const completedCanvas = document.createElement('canvas');
    completedCanvas.width = puzzleAreaWidth;
    completedCanvas.height = puzzleAreaHeight;
    const cctx = completedCanvas.getContext('2d');
    cctx.drawImage(sourceImage, 0, 0, completedCanvas.width, completedCanvas.height);

    // リサイズ済み画像
    const resizedImage = document.createElement('canvas');
    resizedImage.width = puzzleAreaWidth;
    resizedImage.height = puzzleAreaHeight;
    const rctx = resizedImage.getContext('2d');
    rctx.drawImage(sourceImage, 0, 0, resizedImage.width, resizedImage.height);

    const completedPreview = document.getElementById('completedImagePreview');
    if (completedPreview) {
        completedPreview.src = completedCanvas.toDataURL();
    }

    isGameCompleted = false; // 初期化時にフラグをリセット
    pieces = [];
    let idx = 0;
    for (let row = 0; row < rowMax; row++) {
        for (let col = 0; col < colMax; col++) {
            const image = await createPiece(resizedImage, row, col, rowMax, colMax, false);
            const outline = await createPiece(resizedImage, row, col, rowMax, colMax, true);
            const p = new Piece(image, outline, col * pieceSize, row * pieceSize, idx);
            p.visualRotation = p.Rotation; // 初期化
            pieces.push(p);
            idx++;
        }
    }

    // 保存データの位置・回転・ロック状態の適用
    if (savedPiecesData && savedPiecesData.length > 0) {
        savedPiecesData.forEach(s => {
            const p = pieces.find(item => item.originalIndex === s.piece_index);
            if (p) {
                p.X = s.x;
                p.Y = s.y;
                p.Rotation = s.rotation;
                p.visualRotation = s.rotation; // 復元時も即時反映
                p.IsLocked = s.is_locked;
            }
        });

        // グループ参照の復元
        savedPiecesData.forEach(s => {
            const currentPiece = pieces.find(p => p.originalIndex === s.piece_index);
            const leaderPiece = pieces.find(p => p.originalIndex === s.group_id);

            if (currentPiece && leaderPiece && currentPiece !== leaderPiece) {
                if (!leaderPiece.group.includes(currentPiece)) {
                    leaderPiece.group.push(currentPiece);
                    currentPiece.group = leaderPiece.group;
                }
            }
        });
    } else {
        shuffleInitial();
    }

    // リセットボタン
    const resetBtn = document.getElementById('resetBtn');
    // 既存のリスナー重複を防ぐため、単純な追加でなく制御が必要だが、
    // 無名関数で追加しているので削除困難。
    // ここでは簡易的に、resetBtnがcloneNodeでリセットされていない限り重複する可能性があるが、
    // 実用上は画面リロード前提なので許容、あるいは single_play.js 側で制御
    // ★前回の修正で single_play.js 側でもリスナーをつけているので注意

    if (resetBtn) {
        // 古いリスナー削除は難しいので、リセットボタン自体の再生成（クローン）によるリスナー削除テクニックを使う手もあるが、
        // 今回は単純に追加しておく。
        resetBtn.onclick = () => { // onclickプロパティなら上書きされるので安全
            time = 0;
            isGameCompleted = false;
            shuffleInitial();
            drawAll();
            startTimer();
        };
    }

    // ヒントボタン
    const hintBtn = document.getElementById('hintBtn');
    if (hintBtn) hintBtn.onclick = () => {
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
    };

    drawAll();

    // Initial Count
    if (typeof updatePieceCount === 'function') updatePieceCount();

    // Timer Start (if not multiplayer controlled)
    // ...
};

// 画像読み込み関数
async function createSourceImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = url;
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(err);
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
    if (!outlineOnly) {
        ctx.drawImage(sourceImage, -(col * pieceSize - s), -(row * pieceSize - s));
    }

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

// --- アニメーションループ ---
function update() {
    // 回転アニメーション (線形補間)
    pieces.forEach(p => {
        // 目標角度との差分を計算
        let diff = p.Rotation - p.visualRotation;

        // 角度のラップアラウンド補正 (3 -> 0 のときは +1 回転とみなす)
        if (diff < -2) diff += 4;
        if (diff > 2) diff -= 4;

        if (Math.abs(diff) > 0.01) {
            p.visualRotation += diff * 0.2;
        } else {
            // ほぼ追いついたら厳密に合わせる（ただしラップアラウンド時は値を正規化）
            p.visualRotation = p.Rotation;
        }
    });

    drawAll();
    requestAnimationFrame(update);
}

// ... (Rest of shuffleInitial, drawAll, etc) ...

// ★グループ回転処理 (位置補正付き)
function rotateGroup(pivotPiece, direction) {
    if (!pivotPiece) return;

    // direction: 1 (右回転), -1 (左回転)

    pivotPiece.group.forEach(p => {
        // 1. 角度の更新
        if (direction === 1) {
            p.Rotation = (p.Rotation + 1) % 4;
        } else {
            p.Rotation = (p.Rotation - 1 + 4) % 4;
        }

        // 2. 位置の更新 (Pivot中心)
        // ※Pivot自身は位置が変わらないのでスキップ
        if (p === pivotPiece) return;

        // Pivotからの相対座標
        const relX = p.X - pivotPiece.X;
        const relY = p.Y - pivotPiece.Y;

        if (direction === 1) {
            // 右回転 (Clockwise): (x, y) -> (-y, x)
            // キャンバス座標系(y軸下向き)では:
            // (1, 0) [右] -> (0, 1) [下]  =>  newX = -relY, newY = relX
            p.X = pivotPiece.X - relY;
            p.Y = pivotPiece.Y + relX;
        } else {
            // 左回転 (Counter-Clockwise): (x, y) -> (y, -x)
            // キャンバス座標系では:
            // (1, 0) [右] -> (0, -1) [上] => newX = relY, newY = -relX
            p.X = pivotPiece.X + relY;
            p.Y = pivotPiece.Y - relX;
        }
    });

    // ★Hook: Rotate
    if (typeof window.onPieceRotate === 'function') window.onPieceRotate(pivotPiece);
}

// ★キーボード操作 (Q/Eで回転)
window.addEventListener('keydown', (ev) => {
    if (!movingPiece) return;

    if (ev.key.toLowerCase() === 'e') { // 右回転
        rotateGroup(movingPiece, 1);
    } else if (ev.key.toLowerCase() === 'q') { // 左回転
        rotateGroup(movingPiece, -1);
    }
});

// ダブルクリック回転
window.addEventListener('dblclick', (ev) => {
    const rect = can.getBoundingClientRect();
    const clickX = ev.clientX - rect.left;
    const clickY = ev.clientY - rect.top;

    // World座標に変換
    const wRef = toWorld(clickX, clickY);

    // クリックされたピースを探す
    let clickedPiece = null;
    for (let i = pieces.length - 1; i >= 0; i--) {
        if (pieces[i].IsClick(wRef.x, wRef.y)) {
            clickedPiece = pieces[i];
            break;
        }
    }

    // ロックされていないピースをダブルクリックしたら回転
    if (clickedPiece && !clickedPiece.IsLocked) {
        rotateGroup(clickedPiece, 1); // 右回転
        drawAll();
        check();
    }
});

// --- シャッフル ---
function shuffleInitial() {
    if (!pieces || pieces.length === 0) return;
    const shuffleAreaStartX = colMax * pieceSize + pieceSize / 2;
    const shuffleAreaStartY = pieceSize / 2;
    const shuffleAreaWidth = can.width - shuffleAreaStartX - pieceSize;
    const shuffleAreaHeight = can.height - shuffleAreaStartY - pieceSize;

    pieces.forEach(piece => {
        piece.X = shuffleAreaStartX + Math.random() * (shuffleAreaWidth - pieceSize);
        piece.Y = shuffleAreaStartY + Math.random() * (shuffleAreaHeight - pieceSize);
        piece.Rotation = Math.floor(Math.random() * 4);
        piece.visualRotation = piece.Rotation; // 初期状態は即時反映
        piece.IsLocked = false;
        piece.scale = 1;
        piece.shadow = false;
        piece.group = [piece];
    });
}

// --- 描画 ---
let movingPiece = null;
let oldX = 0, oldY = 0;

function resizeCanvas() {
    if (can) {
        can.width = window.innerWidth;
        can.height = window.innerHeight;
        // 再描画が必要なら
        // drawAll();
    }
}

function drawAll() {
    ctx.clearRect(0, 0, can.width, can.height);

    ctx.save();

    // Apply View Transform
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    // Draw Board Boundary
    const boardW = pieceSize * colMax;
    const boardH = pieceSize * rowMax;

    // パズルエリアの背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, boardW, boardH);

    // 枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeRect(0, 0, boardW, boardH);

    // Draw Pieces in Order: Locked (Bottom) -> Loose (Middle) -> Moving (Top)

    // 1. Locked Pieces
    pieces.forEach(p => {
        if (p.IsLocked) p.Draw();
    });

    // 2. Loose Pieces (excluding movingPiece)
    pieces.forEach(p => {
        if (!p.IsLocked && p !== movingPiece) p.Draw();
    });

    // 3. Moving Piece (Top)
    if (movingPiece) movingPiece.Draw();

    ctx.restore();
}

// アニメーションループ開始
requestAnimationFrame(update);


let mouseStartX = 0;
let mouseStartY = 0;

// ★ マウス操作の変更: Zoom & Pan 対応

// Wheel Zoom
window.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const zoomIntensity = 0.001;
    const rect = can.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;

    // 現在のマウス位置（World）を計算
    const worldPos = toWorld(mouseX, mouseY);

    // 新しいスケール
    let newScale = view.scale * (1 - ev.deltaY * zoomIntensity);

    // Clamp Scale
    newScale = Math.min(Math.max(0.1, newScale), 5.0);

    // マウス位置を中心にズームするように view.x, view.y を調整
    // mouseX = view.x + worldPos.x * newScale
    // => view.x = mouseX - worldPos.x * newScale
    view.x = mouseX - worldPos.x * newScale;
    view.y = mouseY - worldPos.y * newScale;

    view.scale = newScale;
    // drawAll()はループで回ってるので不要
}, { passive: false });


window.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    const rect = can.getBoundingClientRect();
    const clickX = ev.clientX - rect.left;
    const clickY = ev.clientY - rect.top;

    // World座標に変換
    const wRef = toWorld(clickX, clickY);

    // --- ピース判定 ---
    if (movingPiece) {
        // Drop
        handleDrop();
    } else {
        // 逆順でチェック（手前のピース優先）
        // Draw Order: Locked -> Loose -> Moving
        // Hit Test Order: Moving -> Loose(Reverse) -> Locked(Reverse)
        let clickedPiece = null; // Fix: Define variable
        let checkList = [];

        // 1. Moving (Usually handled by 'handleDrop' but just in case)
        if (movingPiece) checkList.push(movingPiece);

        // 2. Loose Pieces (Reverse of loose pieces list)
        // loose pieces are pieces.filter(p => !p.IsLocked && p !== movingPiece)
        // We want to iterate them from last to first
        const loose = pieces.filter(p => !p.IsLocked && p !== movingPiece).reverse();
        checkList.push(...loose);

        // 3. Locked Pieces (Reverse) - IF we allow picking locked pieces (we don't for move, but maybe for other interactions?)
        // User said: "pieces that snapped went to back". 
        // And "piece on top of it cannot be grabbed".
        // If we only iterate Loose pieces first, we will find the loose piece on TOP of the locked piece correctly.
        // The previous logic was: `for (let i = pieces.length - 1; ...)` which iterated insertion order.
        // If "Locked" pieces are still in `pieces` array, and simply drawn first, that's fine.
        // BUT the critical issue is: does `pieces` order change? No.
        // If I draw Locked first, then Loose. 
        // A loose piece (index 0) might be drawn ON TOP OF a locked piece (index 10) because I changed drawAll.
        // But `pieces` loop (reverse) hits index 10 first. If index 10 covers index 0, it "hits" index 10.
        // But index 10 is locked, so we skip it? `if (!clickedPiece.IsLocked)` logic is inside the found check?
        // No. The `break` happens as soon as `IsClick` returns true.
        // So if Locked Piece (Bottom) is hit first, we set clickedPiece = Locked, break.
        // Then `if (!clickedPiece.IsLocked)` fails. So we don't pick up the piece.
        // AND we don't check the Loose Piece (Top) because we broke the loop.
        // FIX: We must NOT break if the hit piece is Locked, or better: Use specific order.

        // Correct Hit Test Loop:
        for (const p of checkList) {
            if (p.IsClick(wRef.x, wRef.y)) {
                clickedPiece = p;
                break;
            }
        }

        // If not found in Loose/Moving, check Locked? 
        // Actually if we want to grab loose pieces, we only need to check loose pieces first.
        // If we hit a loose piece, we grab it.
        // If we don't hit any loose piece, we might hit a locked piece (but can't grab it).

        // So `checkList` should contain Loose Pieces (Top) first.
        // If there is ANY loose piece under mouse, we grab it.
        // Even if there is a Locked piece under it (which is physically below it), we hit the loose one first.

        /* 
        Original Loop:
        for (let i = pieces.length - 1; i >= 0; i--) { ... }
        This relies on index order = z-order.
        But my drawAll changed z-order physically (Locked first).
        So I must change hit test order.
        */

        if (clickedPiece && !clickedPiece.IsLocked && !clickedPiece.isHeldByOther) {
            // --- ピースを掴む ---
            movingPiece = clickedPiece;
            mouseStartX = wRef.x; // World座標で保存
            mouseStartY = wRef.y;

            // グループ全体をドラッグ開始状態にする
            movingPiece.group.forEach(p => {
                p.startX = p.X;
                p.startY = p.Y;
                p.scale = 1.05;
                p.shadow = true;
                const idx = pieces.indexOf(p);
                if (idx > -1) {
                    pieces.splice(idx, 1);
                    pieces.push(p);
                }
            });
            if (typeof window.onPieceGrab === 'function') window.onPieceGrab(movingPiece);

        } else {
            // --- 背景クリック -> パンニング開始 ---
            view.isPanning = true;
            view.panStartX = clickX; // Screen座標
            view.panStartY = clickY;
            view.panStartViewX = view.x;
            view.panStartViewY = view.y;
            can.style.cursor = 'grabbing';
        }
    }
});

window.addEventListener('mousemove', (ev) => {
    const rect = can.getBoundingClientRect();
    const currentX = ev.clientX - rect.left;
    const currentY = ev.clientY - rect.top;

    // パンニング中
    if (view.isPanning) {
        const dx = currentX - view.panStartX;
        const dy = currentY - view.panStartY;
        view.x = view.panStartViewX + dx;
        view.y = view.panStartViewY + dy;
        return;
    }

    if (!movingPiece) return;

    // ピース移動中 (World座標系での移動量)
    // 画面上の移動量(dx_screen) / scale = ワールドでの移動量
    // あるいは toWorld で変換した座標の差分
    const wPos = toWorld(currentX, currentY);
    const dx = wPos.x - mouseStartX;
    const dy = wPos.y - mouseStartY;

    // 1. 仮移動
    movingPiece.group.forEach(p => {
        p.X = p.startX + dx;
        p.Y = p.startY + dy;
    });

    // 2. 補正 (無限キャンバスなので、極端なはみ出し以外は許容して良いかもだが、
    // 一応パズルボード周辺から遠すぎると見失うので、ある程度のバウンダリはあっても良い。
    // 今回は「広くする」のが目的なので、厳しい制限は外すか、緩める)
    // 一旦制限ロジックはコメントアウトまたは緩める

    // ★Hook: Move
    if (typeof window.onPieceMove === 'function') window.onPieceMove(movingPiece);
});

window.addEventListener('mouseup', (ev) => {
    if (view.isPanning) {
        view.isPanning = false;
        can.style.cursor = 'default';
        return;
    }
});

// ★離す処理（共通化）
function handleDrop() {
    if (!movingPiece) return;

    const snapDistance = pieceSize / 3;
    let merged = false;

    // 1. 結合判定
    for (const other of pieces) {
        if (movingPiece.group.includes(other)) continue;
        if (movingPiece.Rotation !== other.Rotation) continue;

        for (const myP of movingPiece.group) {
            const isNeighbor = (Math.abs(myP.OriginalCol - other.OriginalCol) + Math.abs(myP.OriginalRow - other.OriginalRow) === 1);
            if (isNeighbor) {
                const idealDistX = (myP.OriginalCol - other.OriginalCol) * pieceSize;
                const idealDistY = (myP.OriginalRow - other.OriginalRow) * pieceSize;
                const currentDistX = myP.X - other.X;
                const currentDistY = myP.Y - other.Y;

                if (Math.abs(currentDistX - idealDistX) < snapDistance &&
                    Math.abs(currentDistY - idealDistY) < snapDistance) {
                    // ★ ユーザー要望により、結合処理を無効化 (盤面吸着のみ有効)
                    // mergeGroups(myP, other);
                    // merged = true;
                    // break;
                }
            }
        }
        if (merged) break; // グループの誰かが結合したら終了
    }

    // 2. 盤面吸着
    if (!merged && movingPiece.Rotation === 0) {
        const distToGoalX = Math.abs(movingPiece.X - movingPiece.OriginalCol * pieceSize);
        const distToGoalY = Math.abs(movingPiece.Y - movingPiece.OriginalRow * pieceSize);
        if (distToGoalX < snapDistance && distToGoalY < snapDistance) {
            snapGroupToBoard(movingPiece);
        }
    }

    // 後処理
    movingPiece.group.forEach(p => {
        p.scale = 1;
        p.shadow = false;
    });

    // ★Hook: Drop (Release)
    if (typeof window.onPieceDrop === 'function') window.onPieceDrop(movingPiece);

    movingPiece = null;
    check();
}

// --- 残りピース数更新 ---
function updatePieceCount() {
    const el = document.getElementById('piece-remaining');
    if (!el) return;

    if (!pieces || pieces.length === 0) {
        el.textContent = "--";
        return;
    }

    // 残り = ロックされていないグループの数 (あるいはピース単体の数？)
    // ユーザー要望: "残りのピース数" -> 未完成のピースの数
    // pieces配列には全ピースが入っている。
    // IsLocked=true のものは完成済み。
    // IsLocked=false のものが未完成。

    const remaining = pieces.filter(p => !p.IsLocked).length;
    el.textContent = `${remaining}`;
}

// Check function updated to call updatePieceCount
function check() {
    updatePieceCount(); // Update count every check

    // Check completion
    const allLocked = pieces.every(p => p.IsLocked);
    if (allLocked && !isGameCompleted) {
        isGameCompleted = true;

        // Stop Timer
        if (timer) clearInterval(timer);

        // Final Draw
        drawAll();

        // Show UI
        if (typeof showCompletionUI === 'function') {
            // In Single Play, 'time' is seconds (number)
            // In Multi Play, 'time' is string (sometimes) or synced number?
            // Actually currently 'time' var is number in single logic.
            // Formatting to time string if needed?
            // UI expects string possibly "123" or "2:03".
            // Let's format it nicely if it's a number.
            showCompletionUI(formatTime(time));
        }
    }
}

function formatTime(s) {
    // If s is string, return logic
    if (typeof s === 'string') return s;
    if (isNaN(s)) return "0秒";
    // Simple seconds for now as requested
    return s + "秒";
}

// (旧リスナー削除済み)

// --- 結合処理用関数 ---

// p1（ドラッグ中のグループの一部）を p2（静止しているグループの一部）に合わせて結合する
function mergeGroups(draggedPiece, stationaryPiece) {
    // 同じピースなら何もしない
    if (draggedPiece === stationaryPiece) {
        console.log('Same piece, skipping merge');
        return;
    }

    const targetGroup = stationaryPiece.group;
    const movingGroup = draggedPiece.group;

    // 既に同じグループなら何もしない
    if (targetGroup === movingGroup) {
        console.log('Already same group, skipping merge');
        return;
    }

    // グループが配列でない、または異常に大きい場合
    if (!Array.isArray(targetGroup) || !Array.isArray(movingGroup)) {
        console.error('Invalid group structure', targetGroup, movingGroup);
        return;
    }

    if (targetGroup.length > 100 || movingGroup.length > 100) {
        console.error('Group too large!', targetGroup.length, movingGroup.length);
        return;
    }

    // 基準となる位置（p2の位置から、p1があるべき位置を計算）
    const correctX = stationaryPiece.X + (draggedPiece.OriginalCol - stationaryPiece.OriginalCol) * pieceSize;
    const correctY = stationaryPiece.Y + (draggedPiece.OriginalRow - stationaryPiece.OriginalRow) * pieceSize;

    // ズレを計算
    const diffX = correctX - draggedPiece.X;
    const diffY = correctY - draggedPiece.Y;

    // 新しい統合グループを作成（無限ループ防止）
    const combinedGroup = [...targetGroup, ...movingGroup];

    // ドラッグ中のグループ全体をズレ分だけ補正して移動
    movingGroup.forEach(p => {
        p.X += diffX;
        p.Y += diffY;
        // 参照先を更新（全員同じグループを見るようにする）
        p.group = combinedGroup;
    });

    // ターゲットグループのメンバーも新しいグループを参照
    targetGroup.forEach(p => {
        p.group = combinedGroup;
    });

    // もし静止側がロック済みなら、くっついたグループもロックする
    if (stationaryPiece.IsLocked) {
        movingGroup.forEach(p => p.IsLocked = true);
    }

    // ★Hook: Merge
    if (typeof window.onPieceMerge === 'function') window.onPieceMerge(draggedPiece, stationaryPiece);
}

// グループ全体を盤面の正解位置に固定する
function snapGroupToBoard(piece) {
    // ズレを計算（現在の位置 - 本来の位置）
    const diffX = (piece.OriginalCol * pieceSize) - piece.X;
    const diffY = (piece.OriginalRow * pieceSize) - piece.Y;

    piece.group.forEach(p => {
        p.X += diffX;
        p.Y += diffY;
        p.IsLocked = true; // ロック
    });
}

// --- 完成チェック ---
function check() {
    if (!pieces || pieces.length === 0) return; // ピースがない場合は判定しない

    let ok = pieces.every(p => p.Check());
    if (ok) {
        if (timer) clearInterval(timer);
        timer = null;
        $time.style.color = '#f00';
        $time.innerHTML = `完了! ${time} 秒`;

        isGameCompleted = true; // フラグを立てる

        // 🚨 single_play.jsで定義された保存関数を呼び出す
        if (typeof saveGame === 'function') {
            saveGame();
        }

        if (typeof showCompletionUI === 'function') {
            showCompletionUI(time);
        } else {
            // Fallback
            setTimeout(() => {
                alert(`パズル完成！タイム: ${time} 秒`);
            }, 600);
        }
    }
}
