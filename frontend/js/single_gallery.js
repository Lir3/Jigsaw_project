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

    // 1. パズルマスターデータ取得 (新しく始める)
    try {
        const mastersRes = await fetch(`${API_BASE_URL}/puzzle/masters`);
        const masters = await mastersRes.json();

        // 修正ポイント：カード内に削除ボタンを追加し、onclickの伝搬を防ぐ
        newList.innerHTML = masters.map(m => `
            <div class="card">
                <div onclick="startNewGame(${m.id})">
                    <img src="${m.image_url}" alt="${m.title}">
                    <h3>${m.title || "無題"}</h3>
                    <p>Start New</p>
                </div>
                <button class="btn-delete" onclick="event.stopPropagation(); deletePuzzle(${m.id})">削除</button>
            </div>
        `).join('');
    } catch (error) {
        console.error("パズルマスターデータの取得に失敗:", error);
        newList.innerHTML = "<p>読み込みエラーが発生しました。</p>";
    }

    // 2. 履歴取得 (つづきから遊ぶ)
    // 2. 履歴取得 (つづきから遊ぶ)
    try {
        // 並行してベストタイムも取得
        const [historyRes, bestsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/puzzle/history/${userId}`),
            fetch(`${API_BASE_URL}/puzzle/best_times/${userId}`)
        ]);

        const history = await historyRes.json();
        const bests = await bestsRes.json();

        if (history.length === 0) {
            historyList.innerHTML = "<p>プレイ履歴はありません</p>";
        } else {
            historyList.innerHTML = history.map(h => {
                const diff = h.difficulty || 'normal';
                const key = `${h.puzzle_id}_${diff}`;
                const localKey = `best_time_${key}`;

                // APIのベストタイムとLocalStorageのベストタイムを比較して良い方を採用
                let bestTimeVal = bests[key];
                const localBest = localStorage.getItem(localKey);

                if (localBest) {
                    const lb = parseInt(localBest);
                    if (bestTimeVal === undefined || lb < bestTimeVal) {
                        bestTimeVal = lb;
                    }
                }

                const bestTimeDisplay = bestTimeVal !== undefined ? `${bestTimeVal}秒` : '-';

                return `
                <div class="card">
                    <div onclick="resumeGame('${h.id}')">
                        <img src="${h.puzzle_masters.image_url}" alt="puzzle">
                        <h3>${h.puzzle_masters.title}</h3>
                        <div class="card-info">
                            <p><span class="label">難易度:</span> ${formatDifficulty(h.difficulty)}</p>
                            <p><span class="label">Best:</span> <span style="color:#e91e63; font-weight:bold;">${bestTimeDisplay}</span></p>
                            <p><span class="label">タイマー:</span> ${h.elapsed_time}秒</p>
                            <p><span class="label">日付:</span> ${new Date(h.updated_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <button class="btn-delete" onclick="event.stopPropagation(); deleteSession('${h.id}')">削除</button>
                </div>
            `}).join('');
        }
    } catch (error) {
        console.error("プレイ履歴の取得に失敗:", error);
        historyList.innerHTML = "<p>履歴の読み込みエラーが発生しました。</p>";
    }
}

/**
 * 新規ゲームを開始し、セッションを作成する
 * @param {number} puzzleId - 選択されたパズルマスターID
 */
/**
 * 新規ゲームを開始し、セッションを作成する
 * @param {number} puzzleId - 選択されたパズルマスターID
 */
let currentPuzzleId = null; // モーダルで選択中のパズルID用

function startNewGame(puzzleId) {
    currentPuzzleId = puzzleId;
    document.getElementById('difficultyModal').style.display = "block"; // モーダル表示
}

function closeModal() {
    document.getElementById('difficultyModal').style.display = "none";
    currentPuzzleId = null;
}

async function confirmStartGame() {
    if (!currentPuzzleId) return;

    // 難易度を取得して保存
    const difficulty = document.getElementById('modalDifficultySelect').value;
    localStorage.setItem('puzzleDifficulty', difficulty);

    try {
        const res = await fetch(`${API_BASE_URL}/puzzle/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, puzzle_id: currentPuzzleId })
        });
        const session = await res.json();
        // セッションIDを持ってプレイ画面へ移動
        window.location.href = `/play?session_id=${session.id}`;
    } catch (error) {
        console.error("新規セッションの作成に失敗:", error);
        alert("新規ゲームの開始に失敗しました。");
        closeModal();
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
// gallery.js 等、ギャラリーを描画している箇所
// single_gallery.js

async function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Loading表示
    const label = document.querySelector('.btn-upload');
    const originalText = label.childNodes[0].textContent; // "新しい画像をアップロード" text node
    label.childNodes[0].textContent = "アップロード中...";
    label.style.pointerEvents = "none"; // 重複連打防止

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_BASE_URL}/puzzle/upload?user_id=${userId}`, {
            method: "POST",
            body: formData
        });

        const result = await res.json();

        if (res.ok) {
            // 成功したらリストの先頭に追加
            const newList = document.getElementById('new-list');
            const m = result.puzzle;

            const newCardHtml = `
                <div class="card">
                    <div onclick="startNewGame(${m.id})">
                        <img src="${m.image_url}" alt="${m.title}">
                        <h3>${m.title || "無題"}</h3>
                        <p>Start New</p>
                    </div>
                    <button class="btn-delete" onclick="event.stopPropagation(); deletePuzzle(${m.id})">削除</button>
                </div>
            `;

            // 既存のHTMLの前に追加
            newList.insertAdjacentHTML('afterbegin', newCardHtml);

            alert("アップロード完了！");
        } else if (res.status === 401) {
            alert("ユーザー情報が無効です。再度ログインしてください。");
            localStorage.removeItem("user_id");
            window.location.href = "/user/login";
        } else {
            alert("アップロード失敗: " + (result.message || "不明なエラー"));
        }
    } catch (error) {
        console.error("Error:", error);
        alert("通信エラーが発生しました");
    } finally {
        // 元に戻す
        label.childNodes[0].textContent = originalText;
        label.style.pointerEvents = "auto";
        // inputをリセット（同じファイルを再度選べるように）
        event.target.value = '';
    }
}

// 削除実行関数
async function deletePuzzle(puzzleId) {
    if (!confirm("このパズルとプレイデータを全て削除しますか？")) return;

    try {
        const response = await fetch(`${API_BASE_URL}/puzzle/${puzzleId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("削除しました");
            location.reload(); // 画面を更新してギャラリーから消す
        } else {
            alert("削除に失敗しました");
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

// セッション削除関数
async function deleteSession(sessionId) {
    if (!confirm("このプレイ履歴を削除しますか？")) return;

    try {
        const response = await fetch(`${API_BASE_URL}/puzzle/session/${sessionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("履歴を削除しました");
            location.reload(); // 画面を更新
        } else {
            alert("削除に失敗しました");
        }
    } catch (error) {
        console.error("Error:", error);
        alert("通信エラーが発生しました");
    }
}

function renderGallery(puzzles) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) return;

    // もし puzzles が配列でない（単一オブジェクトなど）場合は配列に包む
    const puzzleArray = Array.isArray(puzzles) ? puzzles : [puzzles];

    galleryGrid.innerHTML = puzzleArray.map(puzzle => `
        <div class="puzzle-card">
            <img src="${puzzle.image_url}" alt="${puzzle.title}">
            <div class="puzzle-info">
                <h3>${puzzle.title}</h3>
                <div class="actions">
                    <button onclick="playGame(${puzzle.id})">プレイ</button>
                    <button class="delete-btn" onclick="deletePuzzle(${puzzle.id})">削除</button>
                </div>
            </div>
        </div>
    `).join('');
}

function formatDifficulty(diff) {
    if (!diff) return '普通'; // データがない場合はデフォルト
    if (diff === 'easy') return '簡単';
    if (diff === 'hard') return '難しい';
    return '普通';
}