const can = document.getElementById('can');
if (!can) console.error("Canvas element with ID 'can' not found.");
const ctx = can.getContext('2d');

let pieces = [];
let colMax = 0;
let rowMax = 0;
let pieceSize = 80;

// DB連携 (single_play.js) からアクセスされるグローバル変数
let timer = null;
let time = 0; // 経過時間
let isGameCompleted = false; // クリアフラグ
const $time = document.getElementById('time'); // HTML要素
const $status = document.getElementById('status-msg'); // HTML要素 (single_play.jsで使用)

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
    }

    Draw() {
        ctx.save();
        ctx.translate(this.X + pieceSize / 2, this.Y + pieceSize / 2);
        ctx.scale(this.scale, this.scale);

        // ★補間された角度を使用
        const rad = this.visualRotation * 90 * Math.PI / 180;
        ctx.rotate(rad);

        ctx.translate(-pieceSize / 2, -pieceSize / 2);

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
    $time.innerHTML = `${time} 秒`;
    $time.style.color = '#000';
    timer = setInterval(() => {
        time++;
        $time.innerHTML = `${time} 秒`;
    }, 1000);
}

async function initPuzzle(imageUrl, savedPiecesData) {
    if (!can) return;

    // 難易度
    const difficulty = localStorage.getItem('puzzleDifficulty') || 'normal';
    let basePieceCount = 6; // 短い辺の基準分割数
    if (difficulty === 'easy') basePieceCount = 4;
    else if (difficulty === 'hard') basePieceCount = 8;

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

    // 3. キャンバスのサイズを決定
    const puzzleAreaWidth = colMax * pieceSize;
    const puzzleAreaHeight = rowMax * pieceSize;

    can.width = puzzleAreaWidth * 2.5;
    can.height = puzzleAreaHeight * 2;

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

    // クリックされたピースを探す
    let clickedPiece = null;
    for (let i = pieces.length - 1; i >= 0; i--) {
        if (pieces[i].IsClick(clickX, clickY)) {
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

function drawAll() {
    ctx.clearRect(0, 0, can.width, can.height);
    let s = pieceSize / 4;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(s, s, pieceSize * colMax, pieceSize * rowMax);
    pieces.forEach(p => { if (p !== movingPiece) p.Draw(); });
    if (movingPiece) movingPiece.Draw();
}

// アニメーションループ開始
requestAnimationFrame(update);


let mouseStartX = 0;
let mouseStartY = 0;

// ★ マウス操作の変更: クリックで掴み、クリックで離す (Sticky Grab)
window.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    const rect = can.getBoundingClientRect();
    const clickX = ev.clientX - rect.left;
    const clickY = ev.clientY - rect.top;

    if (movingPiece) {
        // --- 既に掴んでいる場合 -> 離す (Drop処理) ---
        handleDrop();
    } else {
        // --- 掴んでいない場合 -> 掴む (Pickup処理) ---
        // クリックされたピースを探す
        let clickedPiece = null;
        for (let i = pieces.length - 1; i >= 0; i--) {
            if (pieces[i].IsClick(clickX, clickY)) {
                clickedPiece = pieces[i];
                break;
            }
        }

        if (!clickedPiece || clickedPiece.IsLocked) return;

        movingPiece = clickedPiece;
        mouseStartX = clickX; // 相対移動用
        mouseStartY = clickY;

        // グループ全体をドラッグ開始状態にする
        movingPiece.group.forEach(p => {
            p.startX = p.X;
            p.startY = p.Y;
            p.scale = 1.05;
            p.shadow = true;

            // 最前面へ
            const idx = pieces.indexOf(p);
            if (idx > -1) {
                pieces.splice(idx, 1);
                pieces.push(p);
            }
        });
    }
});

// マウス移動
window.addEventListener('mousemove', (ev) => {
    if (!movingPiece) return;
    const rect = can.getBoundingClientRect();
    const currentX = ev.clientX - rect.left;
    const currentY = ev.clientY - rect.top;

    // 前回のクリック位置(mouseStartX)からの差分を足す
    // ★Sticky Grabの場合、mouseStartXは「掴んだ瞬間のマウス位置」
    // ここでリアルタイムに更新しないと「前回フレームからの差分」にならない
    // しかし上記のロジック(startX + dx)は「掴んだ位置からの差分」なので、
    // mouseMove中は mouseStartX を更新してはいけない。

    const dx = currentX - mouseStartX;
    const dy = currentY - mouseStartY;

    movingPiece.group.forEach(p => {
        p.X = p.startX + dx;
        p.Y = p.startY + dy;
    });

    // 画面外制限
    const maxX = can.width - pieceSize * 1.5;
    const maxY = can.height - pieceSize * 1.5;
    if (movingPiece.X < 0) movingPiece.X = 0;
    if (movingPiece.Y < 0) movingPiece.Y = 0;
    if (movingPiece.X > maxX) movingPiece.X = maxX;
    if (movingPiece.Y > maxY) movingPiece.Y = maxY;
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
                    mergeGroups(myP, other);
                    merged = true;
                    break;
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
    movingPiece = null;
    check();
}

// (旧リスナー削除済み)

// --- 結合処理用関数 ---

// p1（ドラッグ中のグループの一部）を p2（静止しているグループの一部）に合わせて結合する
function mergeGroups(draggedPiece, stationaryPiece) {
    const targetGroup = stationaryPiece.group;
    const movingGroup = draggedPiece.group;

    // 基準となる位置（p2の位置から、p1があるべき位置を計算）
    const correctX = stationaryPiece.X + (draggedPiece.OriginalCol - stationaryPiece.OriginalCol) * pieceSize;
    const correctY = stationaryPiece.Y + (draggedPiece.OriginalRow - stationaryPiece.OriginalRow) * pieceSize;

    // ズレを計算
    const diffX = correctX - draggedPiece.X;
    const diffY = correctY - draggedPiece.Y;

    // ドラッグ中のグループ全体をズレ分だけ補正して移動
    movingGroup.forEach(p => {
        p.X += diffX;
        p.Y += diffY;

        // 配列を結合
        targetGroup.push(p);

        // 参照先を更新（全員同じグループを見るようにする）
        p.group = targetGroup;
    });

    // もし静止側がロック済みなら、くっついたグループもロックする
    if (stationaryPiece.IsLocked) {
        movingGroup.forEach(p => p.IsLocked = true);
    }
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
