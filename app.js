/**
 * 星愿计划 - 亲子星星激励应用（简化版）
 */

// ==================== 数据模型 ====================

let appState = {
    totalStars: 0,
    records: [],            // { id, type, reason, count, timestamp }
    wishes: [],             // { id, name, starsNeeded, createdAt }
    fulfilledWishes: []     // { ...wish, fulfilledAt, starsUsed }
};

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await requestPersistentStorage();
    await loadData();
    updateUI();
    initEventListeners();
});

async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
    }
}

// ==================== 数据持久化（localStorage + IndexedDB 双重） ====================

const DB_NAME = 'StarWishPlanDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const DATA_KEY = 'starWishPlan';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function loadFromIndexedDB() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(DATA_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch (e) { return null; }
}

async function saveToIndexedDB(data) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(data, DATA_KEY);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) { /* silent */ }
}

async function loadData() {
    let data = null;
    const savedData = localStorage.getItem(DATA_KEY);
    if (savedData) {
        try { data = JSON.parse(savedData); } catch (e) { /* corrupt */ }
    }
    if (!data) {
        data = await loadFromIndexedDB();
        if (data) {
            localStorage.setItem(DATA_KEY, JSON.stringify(data));
        }
    }
    if (data) {
        appState = data;
        appState.records = appState.records || [];
        appState.totalStars = appState.totalStars || 0;
        appState.wishes = appState.wishes || [];
        appState.fulfilledWishes = appState.fulfilledWishes || [];
    }
}

function saveData() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(appState)); } catch (e) { /* full */ }
    saveToIndexedDB(appState).catch(() => {});
}

function resetData() {
    appState = { totalStars: 0, records: [], wishes: [], fulfilledWishes: [] };
    saveData();
}

// ==================== 数据导出/导入 ====================

function exportData() {
    const dataStr = JSON.stringify(appState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `star-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (typeof imported.totalStars !== 'number') { showToast('Invalid file'); return; }
                appState = imported;
                appState.records = appState.records || [];
                appState.wishes = appState.wishes || [];
                appState.fulfilledWishes = appState.fulfilledWishes || [];
                saveData();
                updateUI();
                showToast('Data restored!');
            } catch (err) { showToast('Failed to read file'); }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ==================== 事件监听 ====================

function initEventListeners() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
        }
    });

    // 星星数量选择器
    document.querySelectorAll('.count-options').forEach(group => {
        group.querySelectorAll('.count-option').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.count-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });
    });
}

// ==================== UI 更新 ====================

function updateUI() {
    document.getElementById('starCount').textContent = appState.totalStars;
    renderStarsGrid();
}

function renderStarsGrid() {
    const grid = document.getElementById('starsGrid');
    const emptyState = document.getElementById('emptyBlackboard');
    const total = appState.totalStars;

    if (total <= 0) {
        grid.innerHTML = '';
        emptyState.classList.add('visible');
        return;
    }
    emptyState.classList.remove('visible');

    // 获取最近的 add 记录用于 tooltip
    const recentAdds = appState.records
        .filter(r => r.type === 'add')
        .sort((a, b) => a.timestamp - b.timestamp);

    const starsData = [];
    for (let i = 0; i < Math.min(recentAdds.length, total); i++) {
        starsData.push(recentAdds[i]);
    }
    const remaining = total - starsData.length;
    for (let i = 0; i < remaining; i++) {
        starsData.unshift({ id: `h-${i}`, reason: '历史积累', timestamp: 0 });
    }

    grid.innerHTML = starsData.map((r, i) => {
        const delay = Math.min(i * 0.02, 0.4);
        return `<span class="star-item" 
            data-reason="${escapeHtml(r.reason)}" 
            data-time="${r.timestamp ? formatTime(r.timestamp) : ''}"
            style="animation-delay:${delay}s"
            onclick="showStarDetail(this)">⭐</span>`;
    }).join('');
}

function showStarDetail(el) {
    const reason = el.dataset.reason;
    const time = el.dataset.time;
    const old = document.querySelector('.star-tooltip');
    if (old) old.remove();

    const tip = document.createElement('div');
    tip.className = 'star-tooltip';
    tip.innerHTML = `<div style="font-weight:bold;margin-bottom:3px">${reason}</div>` +
        (time ? `<div style="font-size:11px;opacity:0.8">${time}</div>` : '');
    document.body.appendChild(tip);

    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width/2 - tipRect.width/2;
    let top = rect.top - tipRect.height - 10;
    if (left < 10) left = 10;
    if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;
    if (top < 10) top = rect.bottom + 10;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';

    setTimeout(() => tip.remove(), 2500);
    setTimeout(() => {
        const rm = (e) => { if (e.target !== el) { tip.remove(); document.removeEventListener('click', rm); } };
        document.addEventListener('click', rm);
    }, 100);
}

// ==================== 星星操作 ====================

// 原因选择
function selectReason(btn, type) {
    const parent = btn.closest('.modal-body');
    parent.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    const customArea = parent.querySelector('.custom-input-area');
    if (btn.dataset.reason === 'custom') {
        customArea.style.display = 'block';
        customArea.querySelector('input').focus();
    } else {
        customArea.style.display = 'none';
    }
}

function getSelectedReason(modalId) {
    const modal = document.getElementById(modalId);
    const selected = modal.querySelector('.reason-btn.selected');
    if (!selected) return null;
    if (selected.dataset.reason === 'custom') {
        const input = modal.querySelector('.custom-input-area input');
        const val = input.value.trim();
        return val || null;
    }
    return selected.dataset.reason;
}

function getSelectedCount(modalId) {
    const modal = document.getElementById(modalId);
    const selected = modal.querySelector('.count-option.selected');
    return selected ? parseInt(selected.dataset.count) : 1;
}

function showAddModal() {
    const modal = document.getElementById('addModal');
    modal.querySelector('.custom-input-area').style.display = 'none';
    const customInput = modal.querySelector('.custom-input-area input');
    if (customInput) customInput.value = '';
    // 重置选中状态
    modal.querySelectorAll('.reason-btn').forEach((b, i) => b.classList.toggle('selected', i === 0));
    modal.querySelectorAll('.count-option').forEach((b, i) => b.classList.toggle('selected', i === 0));
    openModal('addModal');
}

function showRemoveModal() {
    if (appState.totalStars <= 0) { showToast('没有星星了'); return; }
    const modal = document.getElementById('removeModal');
    modal.querySelector('.custom-input-area').style.display = 'none';
    const customInput = modal.querySelector('.custom-input-area input');
    if (customInput) customInput.value = '';
    modal.querySelectorAll('.reason-btn').forEach((b, i) => b.classList.toggle('selected', i === 0));
    modal.querySelectorAll('.count-option').forEach((b, i) => b.classList.toggle('selected', i === 0));
    openModal('removeModal');
}

function submitAddStar() {
    const reason = getSelectedReason('addModal');
    if (!reason) { showToast('请选择或输入原因'); return; }
    const count = getSelectedCount('addModal');

    for (let i = 0; i < count; i++) {
        appState.records.unshift({
            id: generateId(),
            type: 'add',
            reason: reason,
            count: 1,
            timestamp: Date.now() - (count - 1 - i)
        });
    }
    appState.totalStars += count;
    saveData();
    updateUI();
    for (let i = 0; i < count; i++) setTimeout(() => playStarAnimation('add'), i * 150);
    showToast(`获得 ${count} 颗星星！⭐`);
    closeModal('addModal');
}

function submitRemoveStar() {
    const reason = getSelectedReason('removeModal');
    if (!reason) { showToast('请选择或输入原因'); return; }
    let count = getSelectedCount('removeModal');
    if (count > appState.totalStars) count = appState.totalStars;

    for (let i = 0; i < count; i++) {
        appState.records.unshift({
            id: generateId(),
            type: 'remove',
            reason: reason,
            count: 1,
            timestamp: Date.now() - (count - 1 - i)
        });
    }
    appState.totalStars -= count;
    saveData();
    updateUI();
    playStarAnimation('remove');
    showToast(`失去 ${count} 颗星星 💔`);
    closeModal('removeModal');
}

// ==================== 修改星星总数 ====================

function showEditTotalModal() {
    document.getElementById('editTotalInput').value = appState.totalStars;
    openModal('editTotalModal');
}

function submitEditTotal() {
    const input = document.getElementById('editTotalInput');
    let newValue = parseInt(input.value);
    if (isNaN(newValue) || newValue < 0) { newValue = 0; input.value = 0; }

    const diff = newValue - appState.totalStars;
    if (diff !== 0) {
        appState.records.unshift({
            id: generateId(),
            type: diff > 0 ? 'add' : 'remove',
            reason: '手动修改总数',
            count: Math.abs(diff),
            timestamp: Date.now()
        });
        appState.totalStars = newValue;
        saveData();
        updateUI();
        showToast(`星星总数已修改为 ${newValue} 颗`);
    }
    closeModal('editTotalModal');
}

// ==================== 历史记录 ====================

let currentFilter = 'all';

function showHistory() {
    currentFilter = 'all';
    renderHistory();
    openModal('historyModal');
    document.querySelectorAll('.filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
}

function filterHistory(filter) {
    currentFilter = filter;
    renderHistory();
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(
            filter === 'all' ? '全部' : filter === 'add' ? '获得' : '失去'
        ));
    });
}

function renderHistory() {
    const container = document.getElementById('historyList');
    let records = [...appState.records];
    if (currentFilter === 'add') records = records.filter(r => r.type === 'add');
    else if (currentFilter === 'remove') records = records.filter(r => r.type === 'remove');

    if (records.length === 0) {
        container.innerHTML = '<div class="empty-history"><div class="empty-icon">📭</div><p>暂无记录</p></div>';
        return;
    }

    container.innerHTML = records.map(record => {
        const icon = record.type === 'add' ? '⭐' : '💔';
        const countText = (record.count && record.count > 1) ? `×${record.count}` : '';
        return `
            <div class="history-item ${record.type}">
                <span class="history-icon">${icon}</span>
                <div class="history-info">
                    <div class="history-reason">${escapeHtml(record.reason)}</div>
                    <div class="history-time">${formatTime(record.timestamp)}</div>
                </div>
                ${countText ? `<span class="history-count">${record.type === 'add' ? '+' : '-'}${record.count}</span>` : ''}
            </div>`;
    }).join('');
}

// ==================== 更多面板 ====================

function showMorePanel() {
    openModal('morePanel');
}

// ==================== 心愿系统 ====================

function showWishList() {
    document.getElementById('wishCurrentStars').textContent = appState.totalStars;
    renderWishList();
    openModal('wishListModal');
}

function renderWishList() {
    const container = document.getElementById('wishList');
    if (appState.wishes.length === 0) {
        container.innerHTML = '<div class="empty-wishes"><div class="empty-icon">🌟</div><p>还没有心愿哦~</p><p class="hint">许一个心愿，努力攒星星吧！</p></div>';
        return;
    }
    container.innerHTML = appState.wishes.map(wish => {
        const progress = Math.min((appState.totalStars / wish.starsNeeded) * 100, 100);
        const canFulfill = appState.totalStars >= wish.starsNeeded;
        return `
            <div class="wish-item">
                <div class="wish-item-header">
                    <div class="wish-name">${escapeHtml(wish.name)}</div>
                    <div class="wish-actions">
                        <button class="wish-action-btn" onclick="editWish('${wish.id}')">✏️</button>
                        <button class="wish-action-btn delete" onclick="deleteWish('${wish.id}')">🗑️</button>
                    </div>
                </div>
                <div class="wish-progress">
                    <div class="progress-bar"><div class="progress-fill ${canFulfill ? 'complete' : ''}" style="width:${progress}%"></div></div>
                    <div class="wish-progress-text">
                        <span class="current">已有 ${appState.totalStars} 颗</span>
                        <span>需要 ${wish.starsNeeded} 颗</span>
                    </div>
                </div>
                <button class="fulfill-wish-btn ${canFulfill ? 'ready' : 'not-ready'}" 
                    onclick="${canFulfill ? `showFulfillModal('${wish.id}')` : ''}" ${canFulfill ? '' : 'disabled'}>
                    ${canFulfill ? '🎉 可以实现啦！' : `还差 ${wish.starsNeeded - appState.totalStars} 颗`}
                </button>
            </div>`;
    }).join('');
}

function showAddWishModal() {
    document.getElementById('wishModalTitle').textContent = '✨ 许个心愿';
    document.getElementById('wishNameInput').value = '';
    document.getElementById('wishAmountInput').value = '10';
    document.getElementById('editWishId').value = '';
    closeModal('wishListModal');
    openModal('addWishModal');
}

function editWish(wishId) {
    const wish = appState.wishes.find(w => w.id === wishId);
    if (!wish) return;
    document.getElementById('wishModalTitle').textContent = '✏️ 编辑心愿';
    document.getElementById('wishNameInput').value = wish.name;
    document.getElementById('wishAmountInput').value = wish.starsNeeded;
    document.getElementById('editWishId').value = wishId;
    closeModal('wishListModal');
    openModal('addWishModal');
}

function adjustWishAmount(delta) {
    const input = document.getElementById('wishAmountInput');
    let v = parseInt(input.value) || 0;
    v = Math.max(1, Math.min(999, v + delta));
    input.value = v;
}

function setWishAmount(amount) { document.getElementById('wishAmountInput').value = amount; }

function saveWish() {
    const name = document.getElementById('wishNameInput').value.trim();
    const starsNeeded = parseInt(document.getElementById('wishAmountInput').value) || 10;
    const editId = document.getElementById('editWishId').value;
    if (!name) { showToast('请输入心愿内容'); return; }

    if (editId) {
        const wish = appState.wishes.find(w => w.id === editId);
        if (wish) { wish.name = name; wish.starsNeeded = starsNeeded; }
        showToast('心愿已更新 ✨');
    } else {
        appState.wishes.push({ id: generateId(), name, starsNeeded, createdAt: Date.now() });
        showToast('心愿已许下 🌟');
    }
    saveData();
    closeModal('addWishModal');
    showWishList();
}

function deleteWish(wishId) {
    if (!confirm('确定要删除这个心愿吗？')) return;
    appState.wishes = appState.wishes.filter(w => w.id !== wishId);
    saveData();
    renderWishList();
    showToast('心愿已删除');
}

function showFulfillModal(wishId) {
    const wish = appState.wishes.find(w => w.id === wishId);
    if (!wish) return;
    document.getElementById('fulfillWishName').textContent = wish.name;
    document.getElementById('fulfillCost').textContent = wish.starsNeeded;
    document.getElementById('fulfillRemaining').textContent = appState.totalStars - wish.starsNeeded;
    document.getElementById('fulfillWishId').value = wishId;
    closeModal('wishListModal');
    openModal('fulfillWishModal');
}

function confirmFulfillWish() {
    const wishId = document.getElementById('fulfillWishId').value;
    const wish = appState.wishes.find(w => w.id === wishId);
    if (!wish || appState.totalStars < wish.starsNeeded) { showToast('星星不够哦~'); return; }

    appState.totalStars -= wish.starsNeeded;
    appState.records.unshift({
        id: generateId(), type: 'remove',
        reason: `实现心愿：${wish.name}`, count: wish.starsNeeded, timestamp: Date.now()
    });
    appState.fulfilledWishes.unshift({ ...wish, fulfilledAt: Date.now(), starsUsed: wish.starsNeeded });
    appState.wishes = appState.wishes.filter(w => w.id !== wishId);

    saveData();
    updateUI();
    closeModal('fulfillWishModal');
    playCelebration();
    showToast(`🎉 心愿「${wish.name}」已实现！`);
}

function showFulfilledWishes() {
    const container = document.getElementById('fulfilledWishList');
    if (appState.fulfilledWishes.length === 0) {
        container.innerHTML = '<div class="empty-wishes"><div class="empty-icon">🏆</div><p>还没有实现的心愿</p><p class="hint">继续努力！</p></div>';
    } else {
        container.innerHTML = appState.fulfilledWishes.map(wish => `
            <div class="fulfilled-item">
                <div class="fulfilled-icon">🎁</div>
                <div class="fulfilled-info">
                    <div class="fulfilled-name">${escapeHtml(wish.name)}</div>
                    <div class="fulfilled-details">花费 ${wish.starsUsed} 颗星星</div>
                </div>
                <div class="fulfilled-date">${formatDateChinese(wish.fulfilledAt)}</div>
            </div>`).join('');
    }
    closeModal('wishListModal');
    openModal('fulfilledWishesModal');
}

// ==================== 弹窗 & 动画 ====================

function openModal(id) { document.getElementById(id).classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('active'); document.body.style.overflow = ''; }

function playStarAnimation(type) {
    const container = document.getElementById('starAnimationContainer');
    const star = document.createElement('div');
    star.className = type === 'add' ? 'flying-star' : 'falling-star';
    star.textContent = type === 'add' ? '⭐' : '💔';
    star.style.left = (Math.random() * 60 + 20) + 'vw';
    star.style.top = '40vh';
    container.appendChild(star);
    setTimeout(() => star.remove(), 1000);
}

function playCelebration() {
    const c = document.createElement('div');
    c.className = 'celebration';
    document.body.appendChild(c);
    const emojis = ['🎉', '🎊', '⭐', '🌟', '✨', '🎁', '🏆', '💫'];
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'confetti';
        p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        p.style.left = Math.random() * 100 + 'vw';
        p.style.animationDelay = Math.random() * 2 + 's';
        p.style.animationDuration = (2 + Math.random() * 2) + 's';
        c.appendChild(p);
    }
    setTimeout(() => c.remove(), 5000);
}

// ==================== 工具函数 ====================

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(ts) {
    const d = new Date(ts), now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs}小时前`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}天前`;
    return `${d.getMonth()+1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDateChinese(ts) {
    const d = new Date(ts);
    return `${d.getMonth()+1}月${d.getDate()}日`;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ==================== 调试 ====================

window.debugStarApp = {
    getState: () => appState,
    resetData: () => { if (confirm('Reset all data?')) { resetData(); updateUI(); showToast('Data reset'); } },
    addTestData: () => {
        const reasons = ['按时吃饭', '按时睡觉', '参加运动'];
        for (let i = 0; i < 20; i++) {
            const isAdd = Math.random() > 0.15;
            const count = Math.ceil(Math.random() * 2);
            appState.records.push({
                id: generateId(), type: isAdd ? 'add' : 'remove',
                reason: isAdd ? reasons[Math.floor(Math.random()*3)] : '没有' + reasons[Math.floor(Math.random()*3)],
                count: count, timestamp: Date.now() - Math.floor(Math.random()*28)*86400000 - Math.random()*43200000
            });
            if (isAdd) appState.totalStars += count;
            else appState.totalStars = Math.max(0, appState.totalStars - count);
        }
        appState.records.sort((a,b) => b.timestamp - a.timestamp);
        saveData(); updateUI(); showToast('Test data added');
    }
};

document.addEventListener('gesturestart', e => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);
