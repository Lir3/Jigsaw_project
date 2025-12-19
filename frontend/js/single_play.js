// --- グローバル変数 (パズルロジックファイルから取得することを想定) ---
// 🚨 注意: これらの変数は、別途読み込まれるパズルロジックファイル (例: puzzle_logic.js)
//         の中でグローバル変数として定義されている必要があります。
// let pieces = []; 
// let time = 0;
// let isGameCompleted = false;
// let timer = null;
// const $time = document.getElementById('time');
// const $status = document.getElementById('status-msg');


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
        if (!res.ok) throw new Error("セッションデータが見つかりません。");

        const data = await res.json();
        const session = data.session;

        // 1. グローバル変数を更新
        time = session.elapsed_time;
        isGameCompleted = session.is_completed;
        const imageUrl = session.puzzle_masters.image_url;

        // 2. パズルロジックの初期化関数を呼び出し
        // ★この関数は、パズルロジックファイル (puzzle_logic.js) に実装されている必要があります
        // initPuzzle(imageUrl, data.pieces); 

        // 3. タイマーを再開
        if (!isGameCompleted) {
            startTimer(); // ★この関数もパズルロジックファイルに実装されている必要があります
        } else {
            // クリア済みの場合は時間を表示してタイマーは起動しない
            if (timer) clearInterval(timer);
            $time.innerHTML = `完了! ${time} 秒`;
            $time.style.color = 'red';
        }

    } catch (e) {
        console.error("データのロードに失敗:", e);
        alert("ゲームデータの読み込みに失敗しました。");
        window.location.href = "/single/gallery"; // ギャラリーに戻す
    }
}

// ----------------------------------------------------
//  保存処理 (ボタンクリック時)
// ----------------------------------------------------

// グループIDを決定するヘルパー関数
function getGroupId(piece) {
    // グループ内のピース配列を参照し、そのグループの最初のピースのインデックスをグループIDとする
    // これにより、保存時の一意性が保証される（再開時にはこのIDを使って再構築する）
    return pieces.indexOf(piece.Group[0]);
}

/**
 * 現在のパズル状態をサーバーに保存する
 */
async function saveGame() {
    if (!sessionId || !userId) return;

    $status.innerHTML = "Saving...";

    // 保存用データ作成
    const piecesData = pieces.map((p, index) => ({
        piece_index: index,
        x: p.X,
        y: p.Y,
        rotation: p.Rotation,
        is_locked: p.IsLocked,
        group_id: getGroupId(p)
    }));

    try {
        await fetch(`${API_BASE_URL}/puzzle/session/${sessionId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                elapsed_time: time,
                is_completed: isGameCompleted,
                pieces: piecesData
            })
        });

        $status.innerHTML = "Saved!";
        setTimeout(() => $status.innerHTML = "", 2000);

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