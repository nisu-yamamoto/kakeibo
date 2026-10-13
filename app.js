// =========================================================
// 家計ブレーキ アプリ本体（JavaScript）
//
//   1. 初期設定
//   2. データの保存と読み込み
//   3. 日付・金額の道具
//   4. 画面の切り替え
//   5. ホーム画面
//   6. 記録する・取り消す・トースト
//   7. 金額入力ダイアログ
//   8. 履歴画面
//   9. 振り返り画面
//  10. 設定画面（予算・ボタン・バックアップ）
//  11. 起動
// =========================================================


// ---------- 1. 初期設定 ----------
// 設定画面で変えられるのは budget（週予算）と presets（ワンタップボタンの金額）。
// 名前と並び順は固定。
const DEFAULT_CATEGORIES = [
  { id: 'gaishoku', name: '外食', budget: 8000, presets: [1300] },
  { id: 'shokuhi',  name: '食費', budget: 2000, presets: [] },
  { id: 'rouhi',    name: '浪費', budget: 2500, presets: [150, 300, 500] },
];

const MAX_PRESETS = 6;                         // 1カテゴリあたりのボタンの上限

// ブラウザ内に保存するときの名前
const RECORDS_KEY  = 'kakeibo-records';
const SETTINGS_KEY = 'kakeibo-settings';
const BACKUP_KEY   = 'kakeibo-last-backup';


// ---------- 2. データの保存と読み込み ----------
function loadJSON(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    alert('保存に失敗しました');
    return false;
  }
}

// 保存された設定を読み込む（無ければ初期設定のまま）
function loadCategories() {
  const saved = loadJSON(SETTINGS_KEY, null);
  return DEFAULT_CATEGORIES.map(def => {
    const s = saved && Array.isArray(saved.categories)
      ? saved.categories.find(c => c.id === def.id)
      : null;
    const budget = s && Number.isInteger(s.budget) && s.budget >= 0 ? s.budget : def.budget;
    const presets = s && Array.isArray(s.presets)
      ? s.presets.filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_PRESETS)
      : def.presets;
    return { ...def, budget, presets };
  });
}

function saveCategories() {
  return saveJSON(SETTINGS_KEY, {
    categories: categories.map(c => ({ id: c.id, budget: c.budget, presets: c.presets })),
  });
}

function saveRecords() {
  saveJSON(RECORDS_KEY, records);
}

// 記録は [{ id, category, amount, time }, ...] という配列
let records = loadJSON(RECORDS_KEY, []);
let categories = loadCategories();


// ---------- 3. 日付・金額の道具 ----------
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// その日が入っている週の「月曜0時」を返す
function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysFromMonday = (d.getDay() + 6) % 7;  // 月=0, 火=1, …, 日=6
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

// その月の1日0時を返す
function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// 「10/12（月）」の形にする
function formatDay(d) {
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

// 「12:05」の形にする
function formatTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 数字を「¥1,300」の形にする（マイナスは「−¥500」）
function yen(n) {
  const sign = n < 0 ? '−' : '';
  return sign + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
}

// start以上・end未満の記録を取り出す
function recordsBetween(start, end) {
  return records.filter(r => {
    const t = new Date(r.time);
    return t >= start && t < end;
  });
}

function sumAmount(list) {
  return list.reduce((sum, r) => sum + r.amount, 0);
}

function findCategory(id) {
  return categories.find(c => c.id === id);
}


// ---------- 4. 画面の切り替え ----------
// URLの「#history」などを見て、表示する画面を決める。
// こうしておくとスマホの「戻る」ボタンで前の画面に戻れる。
const VIEWS = ['home', 'history', 'review', 'settings'];

function currentView() {
  const name = location.hash.replace('#', '');
  return VIEWS.includes(name) ? name : 'home';
}

// 画面を切り替えたとき
function showView() {
  const name = currentView();
  for (const v of VIEWS) {
    document.getElementById(`view-${v}`).hidden = (v !== name);
  }
  document.querySelectorAll('nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${name}`);
  });

  // 履歴と振り返りは、開くたびに「今週」「今月」から表示する
  if (name === 'history') historyWeekStart = getWeekStart(new Date());
  if (name === 'review') reviewMonthStart = getMonthStart(new Date());

  renderCurrentView();
  window.scrollTo(0, 0);
}

// 今の画面を描き直す
function renderCurrentView() {
  const name = currentView();
  if (name === 'home') renderHome();
  if (name === 'history') renderHistory();
  if (name === 'review') renderReview();
  if (name === 'settings') renderSettings();
}

window.addEventListener('hashchange', showView);


// ---------- 5. ホーム画面 ----------
function renderHome() {
  const weekStart = getWeekStart(new Date());
  const weekEnd = addDays(weekStart, 7);       // 次の月曜0時

  document.getElementById('home-week').textContent =
    `今週 ${formatDay(weekStart)}〜${formatDay(addDays(weekStart, 6))}`;

  const thisWeek = recordsBetween(weekStart, weekEnd);
  const cards = document.getElementById('home-cards');
  cards.innerHTML = '';
  const template = document.getElementById('card-template');

  for (const cat of categories) {
    const mine = thisWeek.filter(r => r.category === cat.id);
    const used = sumAmount(mine);
    const remain = cat.budget - used;

    // 型をコピーして中身を埋める
    const card = template.content.firstElementChild.cloneNode(true);
    card.classList.add(cat.id);
    card.querySelector('.tag').textContent = cat.name;
    card.querySelector('.count').textContent = `今週 ${mine.length}回`;
    card.querySelector('.used').textContent = `${yen(used)} / ${yen(cat.budget)}`;

    if (remain >= 0) {
      card.querySelector('.remain-label').textContent = '残り';
      card.querySelector('.remain').textContent = yen(remain);
    } else {
      card.classList.add('over');
      card.querySelector('.remain-label').textContent = 'オーバー';
      card.querySelector('.remain').textContent = yen(-remain);
    }

    // バーの長さ（100%で止める）
    const percent = cat.budget > 0 ? Math.min(used / cat.budget * 100, 100) : 0;
    card.querySelector('.bar-fill').style.width = percent + '%';

    // ワンタップボタン
    const buttons = card.querySelector('.buttons');
    for (const amount of cat.presets) {
      const button = document.createElement('button');
      button.textContent = yen(amount);
      button.addEventListener('click', () => addRecord(cat, amount));
      buttons.appendChild(button);
    }

    // 鉛筆ボタン（ワンタップボタンが無いカテゴリは横いっぱいに）
    const inputButton = document.createElement('button');
    if (cat.presets.length > 0) {
      inputButton.textContent = '✏️';
      inputButton.className = 'input-btn';
      inputButton.setAttribute('aria-label', '金額を入力');
    } else {
      inputButton.textContent = '✏️ 金額を入力';
    }
    inputButton.addEventListener('click', () => openInputDialog(cat));
    buttons.appendChild(inputButton);

    cards.appendChild(card);
  }
}


// ---------- 6. 記録する・取り消す・トースト ----------
function addRecord(cat, amount) {
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    category: cat.id,
    amount: amount,
    time: new Date().toISOString(),
  };
  records.push(record);
  saveRecords();
  renderHome();
  if (navigator.vibrate) navigator.vibrate(15);  // 押したら軽くブルッとする
  showToast(`${cat.name} ${yen(amount)} を記録`, record.id);
}

function removeRecord(id) {
  records = records.filter(r => r.id !== id);
  saveRecords();
}

const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');
const toastUndo = document.getElementById('toast-undo');
let toastTimer = null;
let undoRecordId = null;

// お知らせを数秒だけ出す。記録IDを渡したときだけ「取り消す」を付ける
function showToast(text, recordId = null) {
  undoRecordId = recordId;
  toastText.textContent = text;
  toastUndo.hidden = !recordId;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, recordId ? 5000 : 2500);
}

function hideToast() {
  toast.hidden = true;
  undoRecordId = null;
}

toastUndo.addEventListener('click', () => {
  if (undoRecordId) {
    removeRecord(undoRecordId);
    renderCurrentView();
  }
  hideToast();
});


// ---------- 7. 金額入力ダイアログ ----------
const dialog = document.getElementById('input-dialog');
const amountInput = document.getElementById('amount-input');
const dialogError = document.getElementById('dialog-error');
let dialogCategory = null;

function openInputDialog(cat) {
  dialogCategory = cat;
  document.getElementById('dialog-title').textContent = `${cat.name}の金額`;
  amountInput.value = '';
  dialogError.textContent = '';
  dialog.showModal();
  amountInput.focus();
}

document.getElementById('input-form').addEventListener('submit', (event) => {
  event.preventDefault();                      // ページの再読み込みを止める
  const amount = Number(amountInput.value);
  if (amountInput.value === '' || !Number.isInteger(amount) || amount <= 0) {
    dialogError.textContent = '1円以上の金額を入れてください';
    return;
  }
  dialog.close();
  addRecord(dialogCategory, amount);
});

amountInput.addEventListener('input', () => {
  dialogError.textContent = '';
});

document.getElementById('dialog-cancel').addEventListener('click', () => {
  dialog.close();
});


// ---------- 8. 履歴画面 ----------
let historyWeekStart = getWeekStart(new Date());

function renderHistory() {
  const start = historyWeekStart;
  const end = addDays(start, 7);
  const isThisWeek = start.getTime() === getWeekStart(new Date()).getTime();

  document.getElementById('history-week').textContent =
    `${isThisWeek ? '今週 ' : ''}${formatDay(start)}〜${formatDay(addDays(start, 6))}`;
  document.getElementById('history-next').classList.toggle('invisible', isThisWeek);

  // 新しい順に並べる
  const list = recordsBetween(start, end)
    .sort((a, b) => new Date(b.time) - new Date(a.time));

  // 上の集計（カテゴリごとの回数と金額）
  const summary = document.getElementById('history-summary');
  summary.innerHTML = '';
  for (const cat of categories) {
    const mine = list.filter(r => r.category === cat.id);
    summary.appendChild(makeMetric(cat, `${mine.length}回`, yen(sumAmount(mine))));
  }

  // 記録の一覧（日付ごとに見出しを入れる）
  const ul = document.getElementById('history-list');
  ul.innerHTML = '';
  document.getElementById('history-empty').hidden = list.length > 0;
  ul.hidden = list.length === 0;

  let lastDay = '';
  for (const r of list) {
    const t = new Date(r.time);
    const day = formatDay(t);

    if (day !== lastDay) {
      const dayTotal = sumAmount(list.filter(x => formatDay(new Date(x.time)) === day));
      const head = document.createElement('li');
      head.className = 'day-head';
      head.innerHTML = `<span>${day}</span><span>${yen(dayTotal)}</span>`;
      ul.appendChild(head);
      lastDay = day;
    }

    const cat = findCategory(r.category);
    const name = cat ? cat.name : '不明';
    const li = document.createElement('li');
    li.className = `record ${r.category}`;
    li.innerHTML = `
      <span class="record-time">${formatTime(t)}</span>
      <span class="tag">${name}</span>
      <span class="record-amount">${yen(r.amount)}</span>
      <button class="record-delete" aria-label="この記録を削除">🗑️</button>`;
    li.querySelector('.record-delete').addEventListener('click', () => {
      if (confirm(`${day} ${formatTime(t)} ${name} ${yen(r.amount)}\nこの記録を削除しますか？`)) {
        removeRecord(r.id);
        renderHistory();
        showToast('削除しました');
      }
    });
    ul.appendChild(li);
  }
}

// カテゴリ別の小さな集計ボックスを作る（履歴・振り返りで共通）
function makeMetric(cat, mainText, subText) {
  const box = document.createElement('div');
  box.className = `metric ${cat.id}`;
  box.innerHTML = `
    <span class="tag">${cat.name}</span>
    <p class="metric-main">${mainText}</p>
    <p class="metric-sub">${subText}</p>`;
  return box;
}

document.getElementById('history-prev').addEventListener('click', () => {
  historyWeekStart = addDays(historyWeekStart, -7);
  renderHistory();
});

document.getElementById('history-next').addEventListener('click', () => {
  historyWeekStart = addDays(historyWeekStart, 7);
  renderHistory();
});


// ---------- 9. 振り返り画面 ----------
// 月曜日がその月に入っている週を「その月の週」として数える
let reviewMonthStart = getMonthStart(new Date());

function renderReview() {
  const start = reviewMonthStart;
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const now = new Date();
  const isThisMonth = start.getTime() === getMonthStart(now).getTime();

  document.getElementById('review-month').textContent =
    `${start.getFullYear()}年${start.getMonth() + 1}月`;
  document.getElementById('review-next').classList.toggle('invisible', isThisMonth);

  // --- 今月使った額（カテゴリ別） ---
  const monthRecords = recordsBetween(start, end);
  const summary = document.getElementById('review-summary');
  summary.innerHTML = '';
  for (const cat of categories) {
    const mine = monthRecords.filter(r => r.category === cat.id);
    summary.appendChild(makeMetric(cat, yen(sumAmount(mine)), `${mine.length}回`));
  }
  document.getElementById('review-total').textContent =
    `合計 ${yen(sumAmount(monthRecords))}`;

  // --- 週ごとの結果 ---
  const weeksEl = document.getElementById('review-weeks');
  weeksEl.innerHTML = '';

  const food = categories.filter(c => c.id === 'gaishoku' || c.id === 'shokuhi');
  const rouhi = findCategory('rouhi');
  const foodBudget = food.reduce((s, c) => s + c.budget, 0);
  const totalBudget = categories.reduce((s, c) => s + c.budget, 0);

  let weekStart = getWeekStart(start);
  if (weekStart < start) weekStart = addDays(weekStart, 7);   // 月曜が今月に入る最初の週

  // 記録を始める前の週は数えない（何も使っていない＝全額浮いた、と誤解しないように）
  const firstTime = records.reduce((min, r) => Math.min(min, new Date(r.time).getTime()), Infinity);
  if (firstTime === Infinity) {
    weekStart = end;                                           // 記録がまだ1件も無い
  } else {
    const firstWeek = getWeekStart(new Date(firstTime));
    if (weekStart < firstWeek) weekStart = firstWeek;
  }

  let savedTotal = 0;
  let finishedWeeks = 0;

  while (weekStart < end && weekStart <= now) {
    const weekEnd = addDays(weekStart, 7);
    const finished = weekEnd <= now;
    const weekRecords = recordsBetween(weekStart, weekEnd);

    const foodUsed = sumAmount(weekRecords.filter(r => r.category === 'gaishoku' || r.category === 'shokuhi'));
    const rouhiUsed = sumAmount(weekRecords.filter(r => r.category === 'rouhi'));
    const saved = totalBudget - sumAmount(weekRecords);

    if (finished) {
      savedTotal += saved;
      finishedWeeks++;
    }

    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <div class="week-result-head">
        <span>${formatDay(weekStart)}〜${formatDay(addDays(weekStart, 6))}</span>
        <span class="week-status">${finished ? '' : '進行中'}</span>
      </div>
      <div class="result-row">
        <span class="label">外食＋食費</span>
        <span class="value">${yen(foodUsed)} / ${yen(foodBudget)}</span>
        ${makeBadge(foodUsed, foodBudget, finished)}
      </div>
      <div class="result-row">
        <span class="label">浪費</span>
        <span class="value">${yen(rouhiUsed)} / ${yen(rouhi.budget)}</span>
        ${makeBadge(rouhiUsed, rouhi.budget, finished)}
      </div>
      <div class="result-row total">
        <span class="label">浮いた額</span>
        <span class="value ${saved < 0 ? 'minus-text' : ''}">
          ${finished ? yen(saved) : `今のところ ${yen(saved)}`}
        </span>
      </div>`;
    weeksEl.appendChild(card);

    weekStart = weekEnd;
  }

  if (!weeksEl.children.length) {
    weeksEl.innerHTML = '<p class="empty">この月の記録はありません</p>';
  }

  // --- 今月浮いた額 ---
  const savedEl = document.getElementById('review-saved');
  savedEl.textContent = yen(savedTotal);
  savedEl.classList.toggle('minus', savedTotal < 0);
  document.getElementById('review-saved-note').textContent = finishedWeeks > 0
    ? `終わった${finishedWeeks}週分の「予算 − 使った額」の合計です`
    : 'まだ終わった週がありません（週が終わると確定します）';
}

// 「達成」「オーバー」「途中」のラベル
function makeBadge(used, budget, finished) {
  if (used > budget) return '<span class="badge over">オーバー</span>';
  if (finished) return '<span class="badge ok">達成</span>';
  return '<span class="badge pending">途中</span>';
}

document.getElementById('review-prev').addEventListener('click', () => {
  reviewMonthStart = new Date(reviewMonthStart.getFullYear(), reviewMonthStart.getMonth() - 1, 1);
  renderReview();
});

document.getElementById('review-next').addEventListener('click', () => {
  reviewMonthStart = new Date(reviewMonthStart.getFullYear(), reviewMonthStart.getMonth() + 1, 1);
  renderReview();
});


// ---------- 10. 設定画面 ----------
function renderSettings() {
  const wrap = document.getElementById('settings-categories');
  wrap.innerHTML = '';

  for (const cat of categories) {
    const section = document.createElement('section');
    section.className = `card setting ${cat.id}`;
    section.dataset.id = cat.id;
    section.innerHTML = `
      <div class="card-head"><span class="tag">${cat.name}</span></div>
      <label class="field">週予算（円）
        <input type="number" inputmode="numeric" class="budget-input" value="${cat.budget}">
      </label>
      <p class="field-label">ワンタップボタンの金額（${MAX_PRESETS}個まで）</p>
      <div class="preset-list"></div>
      <button type="button" class="add-preset">＋ ボタンを追加</button>`;

    const listEl = section.querySelector('.preset-list');
    cat.presets.forEach(amount => listEl.appendChild(makePresetRow(amount)));

    section.querySelector('.add-preset').addEventListener('click', () => {
      const row = makePresetRow('');
      listEl.appendChild(row);
      row.querySelector('input').focus();
    });

    wrap.appendChild(section);
  }

  document.getElementById('settings-error').textContent = '';
  renderBackupInfo();
}

// ボタン1個分の入力行（金額＋削除）
function makePresetRow(amount) {
  const row = document.createElement('div');
  row.className = 'preset-row';
  row.innerHTML = `
    <input type="number" inputmode="numeric" placeholder="金額（円）" value="${amount}">
    <button type="button" class="remove-preset">削除</button>`;
  row.querySelector('.remove-preset').addEventListener('click', () => row.remove());
  return row;
}

// 「設定を保存」を押したとき：入力をチェックしてから保存する
document.getElementById('settings-save').addEventListener('click', () => {
  const errorEl = document.getElementById('settings-error');
  const next = [];

  for (const cat of categories) {
    const section = document.querySelector(`.setting[data-id="${cat.id}"]`);
    const budgetInput = section.querySelector('.budget-input');
    const budget = Number(budgetInput.value);
    if (budgetInput.value === '' || !Number.isInteger(budget) || budget < 0) {
      errorEl.textContent = `${cat.name}の週予算は0円以上の整数で入れてください`;
      budgetInput.focus();
      return;
    }

    const presets = [];
    for (const input of section.querySelectorAll('.preset-row input')) {
      if (input.value === '') continue;        // 空欄の行は無視する
      const amount = Number(input.value);
      if (!Number.isInteger(amount) || amount <= 0) {
        errorEl.textContent = `${cat.name}のボタンの金額は1円以上の整数で入れてください`;
        input.focus();
        return;
      }
      presets.push(amount);
    }
    if (presets.length > MAX_PRESETS) {
      errorEl.textContent = `${cat.name}のボタンは${MAX_PRESETS}個までです`;
      return;
    }

    next.push({ ...cat, budget, presets });
  }

  categories = next;
  saveCategories();
  renderSettings();
  showToast('設定を保存しました');
});

// --- バックアップ ---
function renderBackupInfo() {
  const last = loadJSON(BACKUP_KEY, null);
  document.getElementById('backup-info').textContent = last
    ? `前回の書き出し：${formatDay(new Date(last))} ${formatTime(new Date(last))}`
    : 'まだ書き出していません';
}

// 記録と設定を1つのファイルにまとめてダウンロードする
document.getElementById('export-btn').addEventListener('click', () => {
  const now = new Date();
  const data = {
    app: 'kakeibo-brake',
    version: 1,
    exportedAt: now.toISOString(),
    settings: {
      categories: categories.map(c => ({ id: c.id, budget: c.budget, presets: c.presets })),
    },
    records: records,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `kakeibo-backup-${ymd}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  saveJSON(BACKUP_KEY, now.toISOString());
  renderBackupInfo();
  showToast('バックアップを書き出しました');
});

// 「読み込む」ボタン → ファイル選択を開く
const importFile = document.getElementById('import-file');
document.getElementById('import-btn').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';                       // 同じファイルをもう一度選べるようにする
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    alert('このファイルは読み込めませんでした');
    return;
  }
  if (!data || !Array.isArray(data.records)) {
    alert('家計ブレーキのバックアップファイルではないようです');
    return;
  }

  // 形の崩れた記録は取り除く
  const valid = data.records.filter(r =>
    r && typeof r.id === 'string'
      && DEFAULT_CATEGORIES.some(c => c.id === r.category)
      && Number.isInteger(r.amount) && r.amount > 0
      && !isNaN(new Date(r.time).getTime())
  );

  if (!confirm(`${valid.length}件の記録を読み込みます。\n今このスマホにある記録は置き換わります。よろしいですか？`)) {
    return;
  }

  records = valid;
  saveRecords();
  if (data.settings) {
    saveJSON(SETTINGS_KEY, data.settings);
    categories = loadCategories();
  }
  renderSettings();
  showToast('バックアップを読み込みました');
});


// ---------- 11. 起動 ----------
showView();

// アプリに戻ってきたら描き直す（開きっぱなしで週をまたいだときのため）。
// 設定画面は入力途中の内容が消えないよう、描き直さない
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentView() !== 'settings') {
    renderCurrentView();
  }
});

// サービスワーカーを登録（電波が悪くても開けるようにする）
// PCでファイルを直接開いたときは登録できないが、それで問題ない
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
