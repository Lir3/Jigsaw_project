// --- WebSocket & Multiplayer Logic ---

const ROOM_ID = new URLSearchParams(window.location.search).get("room_id");
const USER_ID = localStorage.getItem("user_id");

if (!ROOM_ID || !USER_ID) {
    alert("ルーム情報またはユーザー情報が不足しています。");
    window.location.href = "/room/list";
}

// WebSocket接続
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/puzzle/${ROOM_ID}/${USER_ID}`);

const overlay = document.getElementById("waiting-overlay");
const memberList = document.getElementById("waiting-members");
const hostControls = document.getElementById("host-controls");

let isHost = false; // 自分がホストかどうか（初期JOIN応答などで判定したいが、一旦簡易的に実装）

// --- WebSocket Event Handlers ---

ws.onopen = () => {
    console.log("WebSocket Connected");

    // ルーム参加時はhost_image_urlを確認
    const hostImageUrl = localStorage.getItem("host_image_url");

    // JOINメッセージ送信
    ws.send(JSON.stringify({ type: "JOIN" }));

    // ホストで、画像URLを持っている場合はセットする
    if (hostImageUrl) {
        ws.send(JSON.stringify({
            type: "SET_IMAGE",
            image_url: hostImageUrl
        }));
        // 送信後はクリア（次回の参加時に影響しないように）
        localStorage.removeItem("host_image_url");
    }
};

let isPuzzleInitialized = false;
let pendingGameStartData = null;
let currentImageUrl = null; // 重複初期化防止用

ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
        case "IS_HOST":
            // サーバーからホスト判定を受信
            isHost = msg.is_host;
            console.log("Is host:", isHost);
            break;

        case "PLAYER_JOINED":
            // システムメッセージとして表示
            addChatMessage('SYSTEM', `${msg.username} joined.`, Date.now());
            if (msg.count) updateMemberCount(msg.count);
            break;

        case "PLAYER_LEFT":
            // システムメッセージとして表示
            addChatMessage('SYSTEM', `${msg.username} left.`, Date.now());
            if (msg.count) updateMemberCount(msg.count);
            break;

        case "ROOM_INFO":
            window.currentRoomDifficulty = msg.difficulty;
            console.log("Room difficulty:", window.currentRoomDifficulty);
            break;

        case "GAME_STARTED":
            // まだ初期化(画像ロード)が終わっていない場合は保留する
            if (!isPuzzleInitialized) {
                pendingGameStartData = { pieces: msg.pieces, start_time: msg.start_time };
            } else {
                await startMultiplayerGame(msg.pieces, msg.start_time);
            }
            break;

        case "MOVED":
            handleRemoteMove(msg);
            break;

        case "LOCKED":
            handleRemoteLock(msg);
            break;

        case "UNLOCKED":
            handleRemoteUnlock(msg);
            break;

        case "MERGED":
            handleRemoteMerge(msg);
            break;

        case "IMAGE_SET":
            // 画像が決定した -> パズル初期化
            // 難易度は ROOM_INFO で取得しているはずなのでそれを使う
            // もし取得できていなければデフォルト
            await initPuzzle(msg.image_url, null, window.currentRoomDifficulty);
            isPuzzleInitialized = true;

            // 待機中はタイマーを止める
            if (typeof stopTimer === 'function') stopTimer();
            // 時間表示リセット
            const t = document.getElementById('time');
            if (t) t.innerHTML = "0 秒";

            // ★ホストなら自動的にゲーム開始
            if (isHost) {
                autoStartGame();
            }

            // 保留していたゲーム開始があれば実行
            if (pendingGameStartData) {
                await startMultiplayerGame(pendingGameStartData.pieces, pendingGameStartData.start_time);
                pendingGameStartData = null;
            }
            break;

        case "ROOM_CLOSED":
            alert(msg.message || "ルームが閉じられました");
            // ホストが退出したのでルーム一覧へ
            window.location.href = '/room/list-page';
            break;

        case "CHAT":
            addChatMessage(msg.user_id, msg.message, msg.timestamp, msg.username);
            break;
    }
};

ws.onclose = () => {
    console.log("WebSocket Disconnected");
    alert("通信が切断されました");
};

// --- Game Control ---

// ホスト用：自動ゲーム開始
function autoStartGame() {
    console.log("Auto-starting game as host...");

    if (!pieces || pieces.length === 0) {
        console.error("Pieces not ready yet");
        return;
    }

    // パズルをシャッフル
    if (typeof shuffleInitial === 'function') {
        shuffleInitial();
    }

    // 初期状態をサーバーに送信
    const initialPieces = pieces.map(p => ({
        index: p.originalIndex,
        x: p.X,
        y: p.Y,
        rotation: p.Rotation
    }));

    ws.send(JSON.stringify({
        type: "START_GAME",
        pieces: initialPieces
    }));
}

// --- Local Hooks (puzzle_logic.js から呼ばれる) ---

window.onPieceGrab = (piece) => {
    // 他人にロック通知
    ws.send(JSON.stringify({
        type: "GRAB",
        index: piece.originalIndex
    }));
};

window.onPieceMove = (piece) => {
    // ※頻度制御（Throttle）が必要だが、一旦そのまま送る（ローカルでは即時反映済み）
    // 位置情報を送信
    ws.send(JSON.stringify({
        type: "MOVE",
        index: piece.originalIndex,
        x: piece.X,
        y: piece.Y,
        rotation: piece.Rotation
    }));
};

window.onPieceDrop = (piece) => {
    // リリース通知（最終位置含む）
    ws.send(JSON.stringify({
        type: "RELEASE",
        index: piece.originalIndex,
        x: piece.X,
        y: piece.Y,
        rotation: piece.Rotation
    }));
};

window.onPieceRotate = (piece) => {
    // グループ化されている場合、全メンバーの状態を送信
    // 回転は位置(X,Y)も変わるため、全ピースの座標更新が必要
    if (piece.group && piece.group.length > 1) {
        piece.group.forEach(p => {
            ws.send(JSON.stringify({
                type: "MOVE",
                index: p.originalIndex,
                x: p.X,
                y: p.Y,
                rotation: p.Rotation
            }));
        });
    } else {
        // 単体の場合
        ws.send(JSON.stringify({
            type: "MOVE", // 回転もMOVEで送ってOK
            index: piece.originalIndex,
            x: piece.X,
            y: piece.Y,
            rotation: piece.Rotation
        }));
    }
};

window.onPieceMerge = (dragged, stationary) => {
    ws.send(JSON.stringify({
        type: "MERGE",
        piece1_index: dragged.originalIndex,
        piece2_index: stationary.originalIndex
    }));
};


// --- Remote Handling ---

// 滑らかな移動のためのターゲット位置を保持
const pieceTargets = new Map(); // originalIndex -> {targetX, targetY, targetRotation}

function handleRemoteMove(msg) {
    if (msg.user_id === USER_ID) return; // 自分のは無視

    const p = pieces.find(item => item.originalIndex === msg.index);
    if (p) {
        // ターゲット位置を設定（アニメーションで滑らかに移動）
        pieceTargets.set(msg.index, {
            targetX: msg.x,
            targetY: msg.y,
            targetRotation: msg.rotation
        });

        // グループメンバーの位置も計算
        if (p.group.length > 1) {
            const dx = msg.x - p.X;
            const dy = msg.y - p.Y;

            p.group.forEach(member => {
                if (member !== p) {
                    const currentTarget = pieceTargets.get(member.originalIndex) || {};
                    pieceTargets.set(member.originalIndex, {
                        targetX: member.X + dx,
                        targetY: member.Y + dy,
                        targetRotation: msg.rotation
                    });
                }
            });
        }
    }
}

// アニメーションループ（滑らかな移動）
function animateRemotePieces() {
    let needsRedraw = false;

    pieceTargets.forEach((target, index) => {
        const p = pieces.find(item => item.originalIndex === index);
        if (!p) return;

        // 線形補間で滑らかに移動（速度調整: 0.3 = 30%ずつ近づく）
        const speed = 0.3;
        const dx = target.targetX - p.X;
        const dy = target.targetY - p.Y;

        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            p.X += dx * speed;
            p.Y += dy * speed;
            needsRedraw = true;
        } else {
            p.X = target.targetX;
            p.Y = target.targetY;
            pieceTargets.delete(index); // 到達したら削除
        }

        // 回転も滑らかに（visualRotationを使用）
        if (target.targetRotation !== undefined) {
            p.Rotation = target.targetRotation;
            // visualRotationは既存のアニメーションループで処理される
        }
    });

    if (needsRedraw) {
        drawAll();
    }

    requestAnimationFrame(animateRemotePieces);
}

// アニメーションループ開始
animateRemotePieces();

function handleRemoteLock(msg) {
    if (msg.user_id === USER_ID) return;

    const p = pieces.find(item => item.originalIndex === msg.index);
    if (p) {
        // 他人が操作中
        p.isHeldByOther = true;

        // 視覚的表現（半透明など）
        // 必要ならここで色を変えるなどの処理を追加

        drawAll();
    }
}

function handleRemoteUnlock(msg) {
    const p = pieces.find(item => item.originalIndex === msg.index);
    if (p) {
        p.isHeldByOther = false;
        // 位置同期
        // 位置同期
        p.X = msg.x;
        p.Y = msg.y;
        p.Rotation = msg.rotation;

        // ★ 吸着チェック (相手がスナップさせた場合、座標が正しいはずなのでここでローカルもスナップさせる)
        if (typeof snapGroupToBoard === 'function') {
            snapGroupToBoard(p);
        }

        drawAll();

        // ★ ピース数更新
        if (typeof updatePieceCount === 'function') {
            updatePieceCount();
        }
    }
}

function handleRemoteMerge(msg) {
    const p1 = pieces.find(item => item.originalIndex === msg.piece1_index);
    const p2 = pieces.find(item => item.originalIndex === msg.piece2_index);

    if (p1 && p2) {
        mergeGroups(p1, p2);
        drawAll();
    }
}

function handleRemoteMerge(msg) {
    // リモートからのマージ通知を処理
    const p1 = pieces.find(item => item.originalIndex === msg.piece1_index);
    const p2 = pieces.find(item => item.originalIndex === msg.piece2_index);

    if (p1 && p2) {
        // puzzle_logic.jsのmergeGroups関数を呼ぶ
        if (typeof mergeGroups === 'function') {
            mergeGroups(p1, p2);
            drawAll();
            // ★ ピース数更新
            if (typeof updatePieceCount === 'function') {
                updatePieceCount();
            }
        }
    }
}


// --- Init ---
async function initWait() {
    // 画像ロード待ち
    addLog("Waiting for image...");
}

// ページロード時に実行
window.addEventListener('load', initWait);


// --- Helper ---
function addLog(text) {
    // console.log(text);
}
function updateMemberCount(count) {
    const el = document.getElementById("members-count");
    if (el) el.innerText = count;
}

// ゲーム開始処理
let gameStartTime = null;
let syncedTimerInterval = null;

async function startMultiplayerGame(initialPiecesData, serverStartTime) {
    // ピース位置をサーバーからの情報で上書き
    initialPiecesData.forEach(pData => {
        const p = pieces.find(item => item.originalIndex === pData.index);
        if (p) {
            p.X = pData.x;
            p.Y = pData.y;
            p.Rotation = pData.rotation;
            p.visualRotation = pData.rotation;
            // グループ解除 (初期はバラバラ)
            p.group = [p];
        }
    });


    // 同期タイマー開始
    if (serverStartTime) {
        gameStartTime = serverStartTime;
        startSyncedTimer();
    } else {
        // サーバー時刻がない場合は通常のタイマー
        if (typeof startTimer === 'function') startTimer();
    }

    drawAll();
}

function startSyncedTimer() {
    if (syncedTimerInterval) clearInterval(syncedTimerInterval);

    const timeDisplay = document.getElementById('time');

    syncedTimerInterval = setInterval(() => {
        const currentTime = Math.floor(Date.now() / 1000);
        const elapsedSeconds = currentTime - gameStartTime;

        // ★ global variable 'time' in puzzle_logic.js should be updated
        // assuming 'time' is accessible globally or locally via module scope sharing
        try {
            time = elapsedSeconds;
        } catch (e) { /* ignore ref error */ }

        if (timeDisplay) {
            timeDisplay.innerHTML = `${elapsedSeconds}`;
        }
    }, 1000);
}

// 退出処理
function exitRoom() {
    // WebSocket接続を閉じる
    if (ws) {
        ws.close();
    }
    // localStorageのhost_image_urlをクリア（次回作成時のために）
    localStorage.removeItem('host_image_url');
    // ルーム一覧ページへ遷移
    window.location.href = '/room/list-page';
}

// --- チャット機能 ---

function toggleChat() {
    const container = document.getElementById('chat-container');
    const toggle = document.getElementById('chat-toggle');
    container.classList.toggle('collapsed');
    toggle.innerText = container.classList.contains('collapsed') ? '▲' : '▼';
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    ws.send(JSON.stringify({
        type: "CHAT",
        message: message
    }));

    input.value = '';
}

function addChatMessage(userId, message, timestamp, username) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';

    if (userId === USER_ID) {
        messageDiv.classList.add('own');
    }

    // ユーザー名を表示（サーバーから受信したusernameを優先）
    const userName = username || userId.substring(0, 8);
    const time = new Date(timestamp).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `<strong>${userName}</strong> <span class="time">${time}</span><br>${escapeHtml(message)}`;

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // 自動スクロール
}

// --- 完成図ON/OFF機能 (マルチプレイ用) ---
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleCompletedBtn');
    const previewImgElement = document.getElementById('completedImagePreview');

    if (toggleBtn && previewImgElement) {
        toggleBtn.addEventListener('click', () => {
            if (previewImgElement.style.display === 'none' || previewImgElement.style.display === '') {
                previewImgElement.style.display = 'block';
                toggleBtn.title = '完成図を隠す';
                // toggleBtn.textContent = '完成図を隠す';
            } else {
                previewImgElement.style.display = 'none';
                toggleBtn.title = '完成図を見る';
                // toggleBtn.textContent = '完成図を見る';
            }
        });

        // ドラッグ機能も有効化
        enableImageDrag(previewImgElement);
    }
});

// 完成図ドラッグ機能（共通化できればベストだが簡易的にここに記載）
function enableImageDrag(imgElement) {
    let isDragging = false;
    let offsetX, offsetY;
    let scale = 1;

    imgElement.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        const rect = imgElement.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
        e.stopPropagation(); // Block unintended canvas interaction
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        // Simple drag, similar to single_play.js
        imgElement.style.left = `${e.clientX - 100}px`;
        imgElement.style.top = `${e.clientY - 100}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Zoom
    imgElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Block scroll
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale *= delta;
        scale = Math.min(Math.max(0.5, scale), 5.0); // Limit
        imgElement.style.transform = `scale(${scale})`;
    });

    // Hint Button
    if (typeof setupHintButton === 'function') setupHintButton();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enterキーで送信
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
});


// --- 完成画面表示 ---
function showCompletionUI(currentTime) {
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

    // 2. モーダル表示
    const modal = document.getElementById('completionModal');
    const modalTime = document.getElementById('modalTime');

    if (modal && modalTime) {
        modalTime.textContent = currentTime;
        modal.style.display = 'flex';
    }
}

