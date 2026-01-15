
const API_BASE_URL = "";
const userId = localStorage.getItem("user_id");
const urlParams = new URLSearchParams(window.location.search);
let sessionId = urlParams.get('session_id');

// ----------------------------------------------------
//  ページロード時のセッションデータ読み込み
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    if (!sessionId) return; // session_idがなければシングルプレイではない

    // ユーザーIDがない、またはセッションIDがあるのにユーザーIDがない場合はリダイレクト
    if (!userId) {
        alert("セッションをロードできません。ログインしてください。");
        window.location.href = "/user/login";
        return;
    }

    loadGameData(sessionId);
});

/**
 * サーバーからセッションとピースデータをロードし、パズルを初期化する
 * @param {string} sessionId - ロードするセッションID
 */
// ----------------------------------------------------
//  クリア演出 (puzzle_logic.jsから呼ばれる)
// ----------------------------------------------------
let currentPuzzleId = null;
let currentDifficulty = null;
let isLoadedAsCompleted = false; // ★ 読込時にクリア済みだったか判定するフラグ

async function loadGameData(sessionIdStr) { // 引数名を変更してグローバル変数との衝突回避（念のため）
    try {
        const res = await fetch(`${API_BASE_URL}/puzzle/session/${sessionIdStr}`);
        if (!res.ok) throw new Error("セッションが見つかりません");
        const data = await res.json();

        currentPuzzleId = data.session.puzzle_id;
        currentDifficulty = data.session.difficulty || 'normal';
        isLoadedAsCompleted = data.session.is_completed; // ★ フラグ保存

        // グローバル変数 sessionId を更新 (single_play.js冒頭でconst宣言されているが、再代入可能なletにする必要がある)
        // ※ 既存コードは const sessionId = ... なので、これを let に変更する必要あり
        // ここでは一旦そのまま呼び出し、別途 const -> let 変更を行う

        // 元の処理を実行
        await originalLoadGameDataBase(data);

        // ★ リセットボタンの挙動を追加フック
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            // 既存のリスナーは削除できない（無名関数ため）が、追加は可能
            // puzzle_logic.js のリスナーと同時に動くことになる
            resetBtn.removeEventListener('click', handleResetForCompletedSession); // 重複防止
            resetBtn.addEventListener('click', handleResetForCompletedSession);
        }

    } catch (e) {
        console.error(e);
    }
}

async function handleResetForCompletedSession() {
    // もし「クリア済みのセッション」をリセットしようとした場合
    // 過去の記録（ベストタイム）を消さないために、新しいセッションを発行してそちらに切り替える
    if (isLoadedAsCompleted) {
        console.log("クリア済みセッションのため、新規セッションを作成して切り替えます...");

        try {
            const res = await fetch(`${API_BASE_URL}/puzzle/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    puzzle_id: currentPuzzleId,
                    difficulty: currentDifficulty
                })
            });
            const newSession = await res.json();

            // セッションIDを新しいものに差し替え
            // ※注意: sessionId変数が const だとエラーになるので let に変える必要あり
            sessionId = newSession.id;

            // URLも更新（リロードはしない）
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('session_id', newSession.id);
            window.history.pushState({}, '', newUrl);

            // フラグを下ろす（もう新規セッションなのでリセットし放題）
            isLoadedAsCompleted = false;

            console.log("新規セッションに切り替えました: ", sessionId);

        } catch (e) {
            console.error("新規セッション作成失敗:", e);
            alert("エラー: 新しいゲームの開始に失敗しました。");
        }
    }
}

// 元のloadGameDataの中身を分離して再利用しやすくする
async function originalLoadGameDataBase(data) {
    const session = data.session;
    time = session.elapsed_time || 0;
    if ($time) $time.innerHTML = `${time} `;

    // 画像URL取得
    // ※ backendのload_session実装によるが、puzzle_mastersが結合されている前提
    // puzzle.pyを見る限り select("*, puzzle_masters(*)") なので data.session.puzzle_masters.image_url で取れるはず
    const imageUrl = session.puzzle_masters ? session.puzzle_masters.image_url : null;

    await initPuzzle(imageUrl, data.pieces);

    if (!session.is_completed) {
        startTimer();
    } else {
        $time.innerHTML = `完了! ${time} 秒`;
        $time.style.color = '#f00';
    }
}

async function showCompletionUI(currentTime) {
    // 1. 紙吹雪演出
    var duration = 3 * 1000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    function random(min, max) { return Math.random() * (max - min) + min; }

    var interval = setInterval(function () {
        var timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
            return clearInterval(interval);
        }
        var particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);

    // 2. ベストタイム取得 & モーダル表示
    const modal = document.getElementById('completionModal');
    const modalTime = document.getElementById('modalTime');
    const modalBest = document.getElementById('modalBest');
    const newRecordMsg = document.getElementById('newRecordMsg');

    modalTime.textContent = currentTime;
    modal.style.display = 'block';

    try {
        const res = await fetch(`${API_BASE_URL}/puzzle/best?user_id=${userId}&puzzle_id=${currentPuzzleId}&difficulty=${currentDifficulty}`);
        const data = await res.json();
        const best = data.best_time;

        if (best === null || currentTime <= best) {
            modalBest.textContent = currentTime;
            newRecordMsg.style.display = 'block';

            // LocalStorageにもバックアップ保存（上書き対策）
            const key = `best_time_${currentPuzzleId}_${currentDifficulty}`;
            localStorage.setItem(key, currentTime);
        } else {
            modalBest.textContent = best;
            newRecordMsg.style.display = 'none';

            // LocalStorageの方が良いタイムならそちらを表示（上書き後対策）
            const key = `best_time_${currentPuzzleId}_${currentDifficulty}`;
            const localBest = localStorage.getItem(key);
            if (localBest && parseInt(localBest) < best) {
                modalBest.textContent = localBest;
            }
        }
    } catch (e) {
        console.error("ベストタイム取得失敗", e);
        // API失敗時はLocalStorageを見る
        const key = `best_time_${currentPuzzleId}_${currentDifficulty}`;
        const localBest = localStorage.getItem(key);
        if (localBest) {
            modalBest.textContent = localBest;
            if (currentTime <= parseInt(localBest)) newRecordMsg.style.display = 'block';
        } else {
            modalBest.textContent = "-";
        }
    }
}

// ----------------------------------------------------
//  保存処理 (ボタンクリック時)
// ----------------------------------------------------

function getGroupId(piece) {
    if (piece && piece.group && piece.group.length > 0) {
        // グループの親も originalIndex で指定する
        return piece.group[0].originalIndex;
    }
    return piece.originalIndex;
}

/**
 * 現在のパズル状態をサーバーに保存する
 */
async function saveGame() {
    // ピースが生成されていない場合は保存しない
    if (!pieces || pieces.length === 0) {
        console.warn("保存するピースがありません。");
        return;
    }
    if (!sessionId || !userId) return;

    $status.innerHTML = "Saving...";

    // 保存用データ作成
    const piecesData = pieces.map((p) => ({
        piece_index: p.originalIndex, // ★ 配列の index ではなく、p.originalIndex を使う
        x: p.X,
        y: p.Y,
        rotation: p.Rotation,
        is_locked: p.IsLocked,
        group_id: getGroupId(p)
    }));

    try {
        const response = await fetch(`${API_BASE_URL}/puzzle/session/${sessionId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                elapsed_time: time,
                is_completed: isGameCompleted,
                pieces: piecesData
            })
        });

        if (response.ok) {
            $status.innerHTML = "Saved!";
            console.log("保存成功");
            setTimeout(() => $status.innerHTML = "", 2000);
        } else {
            throw new Error("Save request failed");
        }

    } catch (error) {
        console.error("データの保存に失敗:", error);
        $status.innerHTML = "Save Failed!";
    }
}

/**
 * ギャラリーに戻る前の保存処理
 */
function backToGallery() {
    saveGame().then(() => {
        if (timer) clearInterval(timer);
        window.location.href = "/single/gallery";
    });
}

// --- 完成図ON/OFF機能 (シングルプレイ用) ---
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleCompletedBtn');
    const previewImgElement = document.getElementById('completedImagePreview');

    if (toggleBtn && previewImgElement) {
        toggleBtn.addEventListener('click', () => {
            if (previewImgElement.style.display === 'none' || previewImgElement.style.display === '') {
                previewImgElement.style.display = 'block';
                toggleBtn.textContent = '完成図を隠す';
            } else {
                previewImgElement.style.display = 'none';
                toggleBtn.textContent = '完成図を見る';
            }
        });

        // ドラッグ機能も有効化
        enableImageDrag(previewImgElement);
    }
});

// 完成図ドラッグ機能
function enableImageDrag(imgElement) {
    let isDragging = false;
    let offsetX, offsetY;

    imgElement.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        const rect = imgElement.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        imgElement.style.left = `${e.clientX - offsetX}px`;
        imgElement.style.top = `${e.clientY - offsetY}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });
}