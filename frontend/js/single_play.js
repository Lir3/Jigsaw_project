
const API_BASE_URL = "";
const userId = localStorage.getItem("user_id");
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session_id');

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
async function loadGameData(sessionId) {
    try {
        const res = await fetch(`${API_BASE_URL}/puzzle/session/${sessionId}`);
        if (!res.ok) throw new Error("セッションが見つかりません");
        const data = await res.json();
        const session = data.session;

        time = session.elapsed_time || 0;

        // 2. 画面上の表示も即座に更新しておく
        if ($time) {
            $time.innerHTML = `${time} `;
        }
        // --------------------

        // パズルの初期化（画像やピース位置の復元）
        const imageUrl = session.puzzle_masters.image_url;
        await initPuzzle(imageUrl, data.pieces);

        // ゲームが完了していなければタイマーを開始
        if (!session.is_completed) {
            startTimer();
        } else {
            // 完了済みの場合は「完了」表示にする
            $time.innerHTML = `完了! ${time} 秒`;
            $time.style.color = '#f00';
        }

    } catch (e) {
        console.error("データの読み込みに失敗しました:", e);
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