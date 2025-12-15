const can = document.getElementById('can');
if (!can) console.error("Canvas element with ID 'can' not found.");
const ctx = can.getContext('2d');
let pieces = [];

let colMax = 0;
let rowMax = 0;
let pieceSize = 80;

// ピースクラス
// ピースクラス（グルーピング＋回転対応版）
class Piece {
    constructor(image, outline, x, y) {
        this.Image = image;
        this.Outline = outline;
        this.X = x;
        this.Y = y;
        this.OriginalCol = Math.round(x / pieceSize);
        this.OriginalRow = Math.round(y / pieceSize);
        this.IsLocked = false;

        this.group = [this];
        this.scale = 1;
        this.shadow = false;

        // --- 追加部分 ---
        this.Rotation = 0; // 0:0度, 1:90度, 2:180度, 3:270度

        this.startX = 0;
        this.startY = 0;
    }

    Draw() {
        ctx.save();
        // ピースの中心に原点を移動
        ctx.translate(this.X + pieceSize / 2, this.Y + pieceSize / 2);
        // 拡大縮小
        ctx.scale(this.scale, this.scale);
        // 回転（角度 * 90度をラジアンに変換）
        ctx.rotate(this.Rotation * 90 * Math.PI / 180);
        // 原点を元に戻して描画
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

    IsClick(x, y) {
        const centerX = this.X + pieceSize / 2;
        const centerY = this.Y + pieceSize / 2;

        const dist = Math.hypot(x - centerX, y - centerY);
        const hitRadius = pieceSize * 0.8;

        return dist < hitRadius;
    }

    Check() {
        const col = Math.round(this.X / pieceSize);
        const row = Math.round(this.Y / pieceSize);
        // 位置が合っていて、かつ回転が0度（正しい向き）であること
        return col === this.OriginalCol && row === this.OriginalRow && this.Rotation === 0;
    }
}
// タイマー開始関数
function startTimer() {
    if (timer) clearInterval(timer);
    time = 0;
    $time.innerHTML = '0 秒';
    $time.style.color = '#000';
    timer = setInterval(() => {
        time++;
        $time.innerHTML = `${time} 秒`;
    }, 1000);
}

// --- window.onload ---
window.onload = async () => {
    if (!can) return;

    // 難易度
    const difficulty = localStorage.getItem('puzzleDifficulty') || 'normal';
    let basePieceCount = 6; // 短い辺の基準分割数
    if (difficulty === 'easy') basePieceCount = 4;
    else if (difficulty === 'hard') basePieceCount = 8;

    // 画像読み込み
    const sourceImage = await createSourceImage();

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
        // 横長の場合: 横の分割数を縦横比で調整し、縦の分割数を基準とする
        rowMax = basePieceCount; // 縦のピース数（短い辺）
        colMax = Math.round(rowMax * aspectRatio); // 横のピース数（長い辺）
    } else {
        // 縦長の場合: 縦の分割数を縦横比で調整し、横の分割数を基準とする
        colMax = basePieceCount; // 横のピース数（短い辺）
        rowMax = Math.round(colMax / aspectRatio); // 縦のピース数（長い辺）
    }

    // pieceSize (ピースの1辺のサイズ) を決定
    pieceSize = Math.floor(drawWidth / colMax);

    // 3. キャンバスのサイズを決定
    // ピースサイズと分割数に応じてキャンバスの描画エリアを計算
    const puzzleAreaWidth = colMax * pieceSize;
    const puzzleAreaHeight = rowMax * pieceSize;

    // キャンバス全体のサイズをパズルエリアの約2.5倍/2倍に設定
    can.width = puzzleAreaWidth * 2.5;
    can.height = puzzleAreaHeight * 2;

    // （オプション：Retina対応している場合はdprとctx.scaleの処理をここに入れる）

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
        // 生成したパズル画像をimgタグのソースに設定
        completedPreview.src = completedCanvas.toDataURL();

        // 最初は非表示にしておく（HTMLのCSSで none にしていますが念のため）
        // completedPreview.style.display = 'none'; 
    }

    pieces = [];
    for (let row = 0; row < rowMax; row++) {
        for (let col = 0; col < colMax; col++) {
            const image = await createPiece(resizedImage, row, col, rowMax, colMax, false);
            const outline = await createPiece(resizedImage, row, col, rowMax, colMax, true);
            // pieceSize は square なので、pieceSize, rowMax, colMaxを渡す必要はないが、
            // 元の createPiece の引数に合わせる
            pieces.push(new Piece(image, outline, col * pieceSize, row * pieceSize));
        }
    }

    shuffleInitial();
    drawAll();
    startTimer();

    // リセットボタン
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        shuffleInitial();
        drawAll();
        startTimer(); // ←リセット時もタイマー再スタート
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
    return new Promise(resolve => {
        const image = new Image();

        const uploaded = localStorage.getItem('uploadedImage');
        image.src = uploaded ? uploaded : '/static/favicon1.png';

        image.onload = () => resolve(image);

        image.onerror = () => {
            console.warn("画像読み込み失敗。デフォルト画像を使用します");
            const fallback = new Image();
            fallback.src = '/static/favicon1.png';
            fallback.onload = () => resolve(fallback);
        };
    });
}


async function createPiece(sourceImage, row, col, rowMax, colMax, outlineOnly) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const s = pieceSize / 4;
    canvas.width = s * 6;
    canvas.height = s * 6;

    // --- パスの定義 ---
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

    // --- 変更点: 描画モードの修正 ---

    // 画像を切り抜く（クリップ）
    ctx.clip();

    if (outlineOnly) {
    } else {
        // 画像を描画
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

// --- シャッフル（ランダムな位置と回転） ---
function shuffleInitial() {
    if (!pieces || pieces.length === 0) return;

    // シャッフルエリアの設定（既存のコードから変更なし）
    const shuffleAreaStartX = colMax * pieceSize + pieceSize / 2;
    const shuffleAreaStartY = pieceSize / 2;
    const shuffleAreaWidth = can.width - shuffleAreaStartX - pieceSize;
    const shuffleAreaHeight = can.height - shuffleAreaStartY - pieceSize;

    // 全てのピースに対して処理を実行
    pieces.forEach(piece => {
        // 1. 位置をランダムに設定 (既存)
        piece.X = shuffleAreaStartX + Math.random() * (shuffleAreaWidth - pieceSize);
        piece.Y = shuffleAreaStartY + Math.random() * (shuffleAreaHeight - pieceSize);

        // 2. 回転をランダムに設定 (新規追加)
        // 0, 1, 2, 3 のいずれかをランダムに選択 (0° / 90° / 180° / 270°)
        piece.Rotation = Math.floor(Math.random() * 4);

        // 3. その他の初期状態をリセット (既存)
        piece.IsLocked = false;
        piece.scale = 1;
        piece.shadow = false;

        // 4. グループを自分自身のみにリセット (グルーピング機能を使用している場合)
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


let mouseStartX = 0;
let mouseStartY = 0;

window.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    const rect = can.getBoundingClientRect();
    const clickX = ev.clientX - rect.left;
    const clickY = ev.clientY - rect.top;

    // クリックされたピースを探す（上にあるものから順に）
    let clickedPiece = null;
    for (let i = pieces.length - 1; i >= 0; i--) {
        if (pieces[i].IsClick(clickX, clickY)) {
            clickedPiece = pieces[i];
            break;
        }
    }

    // ロックされているピースや、ピース以外をクリックした場合は無視
    if (!clickedPiece || clickedPiece.IsLocked) return;

    movingPiece = clickedPiece;
    mouseStartX = clickX;
    mouseStartY = clickY;

    // グループ全体をドラッグ開始状態にする
    movingPiece.group.forEach(p => {
        p.startX = p.X;
        p.startY = p.Y;

        // 演出：少し浮かせる
        p.scale = 1.05;
        p.shadow = true;

        // 配列の最後に移動させて最前面に描画する
        const idx = pieces.indexOf(p);
        if (idx > -1) {
            pieces.splice(idx, 1);
            pieces.push(p);
        }
    });

    drawAll();
});

window.addEventListener('mousemove', (ev) => {
    if (!movingPiece) return;
    const rect = can.getBoundingClientRect();
    const currentX = ev.clientX - rect.left;
    const currentY = ev.clientY - rect.top;

    // マウスの移動量
    const dx = currentX - mouseStartX;
    const dy = currentY - mouseStartY;

    // グループ内の全ピースを移動させる
    movingPiece.group.forEach(p => {
        p.X = p.startX + dx;
        p.Y = p.startY + dy;
    });
    // --- キャンバス外に出ないように制限 ---
    const maxX = can.width - pieceSize * 1.5;
    const maxY = can.height - pieceSize * 1.5;

    if (movingPiece.X < 0) movingPiece.X = 0;
    if (movingPiece.Y < 0) movingPiece.Y = 0;
    if (movingPiece.X > maxX) movingPiece.X = maxX;
    if (movingPiece.Y > maxY) movingPiece.Y = maxY;


    // --- 自動スクロール ---
    const margin = 100; // 端からの距離でスクロール
    const scrollSpeed = 20; // スクロール速度

    // 画面下端近く
    if (ev.clientY > window.innerHeight - margin) {
        window.scrollBy(0, scrollSpeed);
    }
    // 画面上端近く
    if (ev.clientY < margin) {
        window.scrollBy(0, -scrollSpeed);
    }
    // 画面右端近く
    if (ev.clientX > window.innerWidth - margin) {
        window.scrollBy(scrollSpeed, 0);
    }
    // 画面左端近く
    if (ev.clientX < margin) {
        window.scrollBy(-scrollSpeed, 0);
    }

    drawAll();
});


window.addEventListener('mouseup', (ev) => {
    if (!movingPiece) return;

    const snapDistance = pieceSize / 3;
    let merged = false;

    // --- 1. グループ同士の結合判定 ---
    for (const other of pieces) {
        if (movingPiece.group.includes(other)) continue;

        // 【追加】回転角度が違うグループとは結合しない
        if (movingPiece.Rotation !== other.Rotation) continue;

        for (const myP of movingPiece.group) {
            // ※回転を考慮して、本来の隣接関係をチェックする必要がありますが、
            // 簡易的な実装として「0度の状態での隣接関係」でチェックします。
            // 厳密な回転パズルにする場合は、ここが非常に複雑になります。

            const colDiff = Math.abs(myP.OriginalCol - other.OriginalCol);
            const rowDiff = Math.abs(myP.OriginalRow - other.OriginalRow);
            const isNeighbor = (colDiff + rowDiff === 1);

            if (isNeighbor) {
                // 理想的な距離と現在の距離を比較（ここは回転の影響を受けにくい座標差分で計算）
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
        if (merged) break;
    }

    // --- 2. 盤面への正解位置吸着 ---
    if (!merged) {
        // 【追加】向きが正しくない(0度でない)場合は盤面に吸着させない
        if (movingPiece.Rotation === 0) {
            const distToGoalX = Math.abs(movingPiece.X - movingPiece.OriginalCol * pieceSize);
            const distToGoalY = Math.abs(movingPiece.Y - movingPiece.OriginalRow * pieceSize);

            if (distToGoalX < snapDistance && distToGoalY < snapDistance) {
                snapGroupToBoard(movingPiece);
            }
        }
    }

    // --- 後処理 ---
    movingPiece.group.forEach(p => {
        p.scale = 1;
        p.shadow = false;
    });

    movingPiece = null;
    drawAll();
    check();
});

// --- 回転操作（ダブルクリック） ---
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
        // グループ全員の回転角度を進める
        clickedPiece.group.forEach(p => {
            p.Rotation = (p.Rotation + 1) % 4; // 0->1->2->3->0...
        });

        drawAll();
        // 回転によって偶然正解位置にはまる可能性があるのでチェック
        check();
    }
});

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

        setTimeout(() => {
            alert(`パズル完成！タイム: ${time} 秒`);
        }, 600);
    }
}
