const input = document.getElementById('imageInput');
const startBtn = document.getElementById('startBtn');
let uploadedImageBase64 = null;

// 画像選択
input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedImageBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
});

// パズル開始
startBtn.addEventListener('click', () => {
    if (!uploadedImageBase64) {
        // 画像が選択されていない場合はアラート
        // ※デバッグ用にデフォルト画像があるならスルーでも可
        if (!localStorage.getItem('uploadedImage')) {
            alert("画像を選択してください。");
            return;
        }
    }
    if (uploadedImageBase64) {
        localStorage.setItem('uploadedImage', uploadedImageBase64);
    }

    // 選択した難易度も保存
    const difficulty = document.getElementById('difficulty').value;
    localStorage.setItem('puzzleDifficulty', difficulty);

    // ページリロードして play.js で読み込み
    window.location.reload();
});

// --- 完成図ドラッグ機能 ---
const previewImg = document.getElementById('completedImagePreview');
let isDraggingImg = false;
let imgOffsetX, imgOffsetY;

previewImg.addEventListener('mousedown', (e) => {
    // 左クリックのみ反応
    if (e.button !== 0) return;
    isDraggingImg = true;

    // クリックした位置と画像の左上との差分を計算
    const rect = previewImg.getBoundingClientRect();
    imgOffsetX = e.clientX - rect.left;
    imgOffsetY = e.clientY - rect.top;

    // ブラウザのデフォルトのドラッグ動作を無効化
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isDraggingImg) return;

    // 新しい位置を計算
    const newLeft = e.clientX - imgOffsetX;
    const newTop = e.clientY - imgOffsetY;

    previewImg.style.left = `${newLeft}px`;
    previewImg.style.top = `${newTop}px`;
});

window.addEventListener('mouseup', () => {
    isDraggingImg = false;
});

// 完成図のON/OFF切り替え
const toggleBtn = document.getElementById('toggleCompletedBtn');
const previewImgElement = document.getElementById('completedImagePreview');

toggleBtn.addEventListener('click', () => {
    // 現在の display スタイルを確認して切り替える
    if (previewImgElement.style.display === 'none' || previewImgElement.style.display === '') {
        previewImgElement.style.display = 'block'; // 表示
        toggleBtn.textContent = '完成図を隠す';     // ボタンの文字変更（任意）
    } else {
        previewImgElement.style.display = 'none';  // 非表示
        toggleBtn.textContent = '完成図を見る';     // ボタンの文字変更（任意）
    }
});

// --- ゲーム初期化 (puzzle_logic.js を使用) ---
window.addEventListener('load', async () => {
    // puzzle_logic.js の initPuzzle があるか確認
    if (typeof initPuzzle !== 'function') {
        console.warn("initPuzzle function is not defined. puzzle_logic.js may not be loaded.");
        return;
    }

    // アップロードされた画像があるか確認
    const uploaded = localStorage.getItem('uploadedImage');
    if (!uploaded) return;

    // パズル初期化 (保存データは無いので null or [])
    // ※ difficultyは puzzle_logic.js 内で localStorage から読み込まれる
    console.log("Initializing puzzle via upload.js...");
    try {
        await initPuzzle(uploaded, null);
        // ★ ゲストプレイでもタイマーを開始する
        if (typeof startTimer === 'function') {
            startTimer();
        }
    } catch (e) {
        console.error("Error initializing puzzle:", e);
    }
});
