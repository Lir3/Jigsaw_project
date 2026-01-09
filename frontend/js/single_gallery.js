// APIのベースURL
const API_BASE_URL = ""; // ルートからの相対パスを使用 (FastAPIサーバーと同じホストを想定)
const userId = localStorage.getItem("user_id");

// ログインチェックと初期化
if (!userId) {
    alert("ログイン情報が見つかりません。ログイン画面へ移動します。");
    // ★ログイン画面へのリダイレクトパスは適宜修正してください
    window.location.href = "/user/login";
} else {
    loadGallery();
}

/**
 * ギャラリー画面にパズルマスターとプレイ履歴を表示する
 */
async function loadGallery() {
    const historyList = document.getElementById('history-list');
    const newList = document.getElementById('new-list');

    // 1. パズルマスターデータ取得
    try {
        const mastersRes = await fetch(`${API_BASE_URL}/puzzle/masters`);
        const masters = await mastersRes.json();

        newList.innerHTML = masters.map(m => `
            <div class="card" onclick="startNewGame(${m.id})">
                <img src="${m.image_url}" alt="${m.title}">
                <h3>${m.title}</h3>
                <p>Start New</p>
            </div>
        `).join('');
    } catch (error) {
        console.error("パズルマスターデータの取得に失敗:", error);
        newList.innerHTML = "<p>パズルマスターデータの読み込み中にエラーが発生しました。</p>";
    }

    // 2. 履歴取得
    try {
        const historyRes = await fetch(`${API_BASE_URL}/puzzle/history/${userId}`);
        const history = await historyRes.json();

        if (history.length === 0) {
            historyList.innerHTML = "<p>プレイ履歴はありません</p>";
        } else {
            historyList.innerHTML = history.map(h => `
                <div class="card" onclick="resumeGame('${h.id}')">
                    <img src="${h.puzzle_masters.image_url}" alt="puzzle">
                    <h3>${h.puzzle_masters.title}</h3>
                    <p>Time: ${h.elapsed_time}s</p>
                    <p>${h.is_completed ? "★ Clear" : "Playing"}</p>
                    <small>${new Date(h.updated_at).toLocaleDateString()}</small>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error("プレイ履歴の取得に失敗:", error);
        historyList.innerHTML = "<p>プレイ履歴の読み込み中にエラーが発生しました。</p>";
    }
}

/**
 * 新規ゲームを開始し、セッションを作成する
 * @param {number} puzzleId - 選択されたパズルマスターID
 */
async function startNewGame(puzzleId) {
    try {
        const res = await fetch(`${API_BASE_URL}/puzzle/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, puzzle_id: puzzleId })
        });
        const session = await res.json();
        // セッションIDを持ってプレイ画面へ移動
        window.location.href = `/play?session_id=${session.id}`;
    } catch (error) {
        console.error("新規セッションの作成に失敗:", error);
        alert("新規ゲームの開始に失敗しました。");
    }
}

/**
 * 既存のセッションを再開する
 * @param {string} sessionId - 再開するセッションのUUID
 */
function resumeGame(sessionId) {
    window.location.href = `/play?session_id=${sessionId}`;
}

// アップロード処理
async function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE_URL}/puzzle/upload?user_id=${userId}`, {
        method: "POST",
        body: formData
    });

    if (res.ok) {
        alert("アップロード完了！");
        location.reload(); // 再読み込みして反映
    }
}

// 削除処理
async function deletePuzzle(puzzleId) {
    if (!confirm("このパズルを削除しますか？（保存したデータも消えます）")) return;

    const res = await fetch(`${API_BASE_URL}/puzzle/${puzzleId}`, {
        method: "DELETE"
    });

    if (res.ok) {
        location.reload();
    }
}