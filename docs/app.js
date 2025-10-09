// --- Utility ---
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
// btoaは非ASCIIに弱いのでUTF-8経由でエンコードしてID化
function hashId(str) { return btoa(unescape(encodeURIComponent(str))).slice(0, 24); }

// --- Storage ---
const STORAGE_KEY = 'qa-progress-v1';
let progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
function saveProgress() { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
function resetProgress() { progress = {}; saveProgress(); }

// --- SM-2（間隔反復アルゴリズム） ---
function nextSchedule(prev) {
    const p = Object.assign({ ef: 2.5, rep: 0, interval: 0 }, prev || {});
    return function (grade) {
        // EF更新
        let EF = p.ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
        EF = Math.max(EF, 1.3);
        // 間隔・反復回数
        let rep = p.rep;
        let interval = 1;
        if (grade < 3) { rep = 0; interval = 1; } // 忘れた → 短期再出題
        else {
            rep = p.rep + 1;
            if (rep === 1) interval = 1;
            else if (rep === 2) interval = 6;
            else interval = Math.round((p.interval || 6) * EF);
        }
        const nextDue = addDays(new Date(), interval);
        return { ef: EF, rep, interval, nextDue: nextDue.toISOString() };
    };
}

// --- App State ---
let cards = []; // { id, q, a, tags }
let queue = [];
let currentIndex = 0;

// --- DOM ---
const elQ = document.getElementById('question');
const elA = document.getElementById('answer');
const elAW = document.getElementById('answer-wrap');
const elStart = document.getElementById('btn-start');
const elRandom = document.getElementById('btn-random');
const elFile = document.getElementById('file-input');
const elReset = document.getElementById('btn-reset');
const elList = document.getElementById('card-list');
const elSearch = document.getElementById('search');
const statTotal = document.getElementById('stat-total');
const statDue = document.getElementById('stat-due');
const statAcc = document.getElementById('stat-accuracy');

// --- Stats ---
function renderStats() {
    statTotal.textContent = `総カード: ${cards.length}`;
    const dueCount = cards.filter(c => isDue(c)).length;
    statDue.textContent = `今日の復習: ${dueCount}`;
    statAcc.textContent = `正答率: ${calcAccuracy()}%`;
}
function calcAccuracy() {
    let total = 0, correct = 0;
    for (const id in progress) {
        const p = progress[id];
        if (p.lastGrades && p.lastGrades.length) {
            p.lastGrades.forEach(g => { total++; if (g >= 4) correct++; });
        }
    }
    return total ? Math.round((correct / total) * 100) : 0;
}
function isDue(card) {
    const p = progress[card.id];
    if (!p || !p.nextDue) return true; // 未学習は出題対象
    const due = new Date(p.nextDue);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return due <= now;
}

// --- Queue / Render ---
function buildQueue(mode) {
    if (mode === 'random') {
        queue = cards.slice();
        for (let i = queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue[i], queue[j]] = [queue[j], queue[i]];
        }
    } else {
        queue = cards.filter(c => isDue(c));
    }
    currentIndex = 0;
}
function showCurrent() {
    elAW.open = false;
    const c = queue[currentIndex];
    if (!c) { elQ.textContent = '出題対象がありません。'; elA.textContent = ''; return; }
    elQ.textContent = c.q; elA.textContent = c.a;
}

// --- Review ---
function grade(grade) {
    const c = queue[currentIndex]; if (!c) return;
    const prev = progress[c.id] || { ef: 2.5, rep: 0, interval: 0, lastGrades: [] };
    const sched = nextSchedule(prev)(grade);
    progress[c.id] = Object.assign({}, prev, sched);
    progress[c.id].lastGrades = (prev.lastGrades || []).slice(-99); // 直近100件保持
    progress[c.id].lastGrades.push(grade);
    saveProgress();
    currentIndex++; showCurrent(); renderStats();
}

// --- Events ---
for (const btn of document.querySelectorAll('.grade-btn')) {
    btn.addEventListener('click', () => grade(parseInt(btn.dataset.grade)));
}
elStart.addEventListener('click', () => { buildQueue('due'); showCurrent(); });
elRandom.addEventListener('click', () => { buildQueue('random'); showCurrent(); });
elReset.addEventListener('click', () => {
    if (confirm('進捗をリセットします。よろしいですか？')) {
        resetProgress(); renderStats();
    }
});
elSearch.addEventListener('input', () => {
    const q = elSearch.value.toLowerCase();
    renderList(cards.filter(c => c.q.toLowerCase().includes(q) || c.a.toLowerCase().includes(q)));
});

// --- List ---
function renderList(list) {
    elList.innerHTML = '';
    list.forEach(c => {
        const li = document.createElement('li');
        const p = progress[c.id];
        const dueStr = p && p.nextDue ? new Date(p.nextDue).toLocaleDateString('ja-JP') : '未';
        li.innerHTML = `<strong>${c.q}</strong><br><span class="muted">次回: ${dueStr}</span>`;
        elList.appendChild(li);
    });
}

// --- CSV loading（docs/data/勉強用.csv） ---
async function loadCSVFromPath(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`CSV取得失敗: ${res.status}`);
        const text = await res.text();
        const parsed = Papa.parse(text, { skipEmptyLines: true });
        let data = parsed.data;

        // 先頭行がヘッダーっぽい場合は除外（例: 用語,説明,タグ）
        if (data.length && String(data[0][0]).includes('用語')) {
            data = data.slice(1);
        }

        cards = data.map(row => {
            const question = String(row[0] || '').trim();
            const answer = String(row[1] || '').trim();
            const tags = String(row[2] || '').trim();
            const id = hashId(question);
            return { id, q: question, a: answer, tags };
        }).filter(c => c.q && c.a);

        renderStats();
        renderList(cards);
    } catch (e) {
        elQ.textContent = 'CSVの読み込みに失敗しました。パスやGitHub Pagesの設定をご確認ください。';
        elA.textContent = String(e);
    }
}

// --- Local file upload（ブラウザから差し替え可能） ---
elFile.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = Papa.parse(text, { skipEmptyLines: true });
    let data = parsed.data;
    if (data.length && String(data[0][0]).includes('用語')) data = data.slice(1);

    cards = data.map(row => {
        const question = String(row[0] || '').trim();
        const answer = String(row[1] || '').trim();
        const tags = String(row[2] || '').trim();
        const id = hashId(question);
        return { id, q: question, a: answer, tags };
    }).filter(c => c.q && c.a);

    renderStats();
    renderList(cards);
});

// --- Boot ---
loadCSVFromPath('./data/勉強用.csv');