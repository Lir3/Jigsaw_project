const input = document.getElementById('imageInput');
const startBtn = document.getElementById('startBtn');
let uploadedImageBase64 = null;

// 画像選択
input.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Show filename
    const nameEl = document.getElementById('fileName');
    if (nameEl) nameEl.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedImageBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
});

// パズル開始
startBtn.addEventListener('click', () => {
    // 画像チェック
    if (!uploadedImageBase64) {
        if (!localStorage.getItem('uploadedImage')) {
            alert("画像を選択してください。");
            return;
        }
    }
    if (uploadedImageBase64) {
        localStorage.setItem('uploadedImage', uploadedImageBase64);
    }

    // 難易度（スライダーから取得）
    const difficulty = document.getElementById('difficultySlider').value;
    localStorage.setItem('puzzleDifficulty', difficulty);

    // ★ UI切り替え: 設定画面を非表示、ゲーム画面を表示
    // (upload.htmlはSingle Pageっぽく振る舞っているのでリロードするとまた設定画面に戻ってしまう)
    // リロードせずに開始するか、リロード後に状態復元するか？
    // 従来のJSは `window.location.reload()` していた。
    // リロードすると initPuzzle が走る。
    // その際、startTimerも走る。
    // しかしリロードするとHTMLが初期状態（Setup表示）に戻る。
    // これではゲームができない。

    // 解決策: localStorageにフラグを立てるか、リロードせずに initPuzzle を呼ぶ。
    // 既存コードの `window.addEventListener('load', ...)` はリロード前提。
    // リロードをやめて、その場で initPuzzle を呼ぶ形に変更する。

    // Setup非表示
    document.getElementById('setup-container').style.display = 'none';
    document.querySelector('.header-controls').style.display = 'flex';

    // パズル初期化
    if (typeof initPuzzle === 'function') {
        // uploadedImageBase64 または localStorage
        const img = uploadedImageBase64 || localStorage.getItem('uploadedImage');
        initPuzzle(img, parseInt(difficulty)).then(() => {
            if (typeof startTimer === 'function') startTimer();
        });
    }
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
    } else {
        previewImgElement.style.display = 'none';  // 非表示
    }
});

// --- ゲーム初期化 (puzzle_logic.js を使用) ---
// window.addEventListener('load') での自動初期化は廃止し、スタートボタン押下時に実行する
// これにより、常に設定画面からスタートできる
/*
window.addEventListener('load', async () => {
   // ... removed ...
});
*/
