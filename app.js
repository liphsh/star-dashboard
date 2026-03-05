/**
 * 星愿计划 - 亲子星星激励应用
 * Star Wish Plan - Parent-Child Star Reward App
 */

// ==================== 数据模型 ====================

// 应用状态
let appState = {
    totalStars: 0,          // 星星总数
    mode: 'home',           // 当前模式: 'home' 或 'away'
    records: [],            // 所有星星记录
    lastSnapshot: null,     // 最后一次快照
    wishes: [],             // 心愿列表
    fulfilledWishes: []     // 已实现的心愿
};

// 记录结构
// {
//     id: string,           // 唯一ID
//     type: 'add' | 'remove', // 类型
//     reason: string,       // 原因
//     timestamp: number,    // 时间戳
//     mode: 'home' | 'away', // 记录时的模式
//     synced: boolean,      // 是否已同步到黑板
//     deleteReason: string  // 删除原因（仅在外删除时使用）
// }

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await requestPersistentStorage();
    await loadData();
    updateUI();
    initEventListeners();
});

// 请求永久存储权限，防止系统/手机管家清理数据
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        const granted = await navigator.storage.persist();
        console.log(granted ? '已获得永久存储权限' : '永久存储权限未授予');
    }
}

// ==================== 数据持久化（双重保障） ====================

const DB_NAME = 'StarWishPlanDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const DATA_KEY = 'starWishPlan';

// 打开 IndexedDB
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

// 从 IndexedDB 读取数据
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
    } catch (e) {
        console.error('IndexedDB 读取失败:', e);
        return null;
    }
}

// 写入 IndexedDB
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
    } catch (e) {
        console.error('IndexedDB 写入失败:', e);
    }
}

// 加载数据：优先 localStorage，失败则从 IndexedDB 恢复
async function loadData() {
    let data = null;

    // 先尝试 localStorage
    const savedData = localStorage.getItem(DATA_KEY);
    if (savedData) {
        try {
            data = JSON.parse(savedData);
        } catch (e) {
            console.error('localStorage 数据解析失败');
        }
    }

    // localStorage 没有数据时，从 IndexedDB 恢复
    if (!data) {
        console.log('localStorage 为空，尝试从 IndexedDB 恢复...');
        data = await loadFromIndexedDB();
        if (data) {
            console.log('从 IndexedDB 恢复数据成功！');
            // 恢复到 localStorage
            localStorage.setItem(DATA_KEY, JSON.stringify(data));
        }
    }

    if (data) {
        appState = data;
        // 确保数据结构完整
        appState.records = appState.records || [];
        appState.totalStars = appState.totalStars || 0;
        appState.mode = appState.mode || 'home';
        appState.wishes = appState.wishes || [];
        appState.fulfilledWishes = appState.fulfilledWishes || [];
    }
}

// 保存数据：同时写入 localStorage 和 IndexedDB
function saveData() {
    const jsonStr = JSON.stringify(appState);

    // 写入 localStorage
    try {
        localStorage.setItem(DATA_KEY, jsonStr);
    } catch (e) {
        console.error('localStorage 写入失败:', e);
    }

    // 异步写入 IndexedDB 作为备份
    saveToIndexedDB(appState).catch(e => {
        console.error('IndexedDB 备份失败:', e);
    });
}

// 重置数据
function resetData() {
    appState = {
        totalStars: 0,
        mode: 'home',
        records: [],
        lastSnapshot: null,
        wishes: [],
        fulfilledWishes: []
    };
    saveData();
}

// ==================== 数据导出/导入 ====================

// 导出数据为 JSON 文件
function exportData() {
    const dataStr = JSON.stringify(appState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}`;
    const filename = `star-dashboard-backup-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Backup exported successfully!');
}

// 触发文件选择进行导入
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

                // 基本校验
                if (typeof imported.totalStars !== 'number' || !Array.isArray(imported.records)) {
                    showToast('Invalid backup file');
                    return;
                }

                appState = imported;
                appState.records = appState.records || [];
                appState.wishes = appState.wishes || [];
                appState.fulfilledWishes = appState.fulfilledWishes || [];
                saveData();
                updateUI();
                showToast('Data restored successfully!');
            } catch (err) {
                showToast('Failed to read backup file');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// 初始化事件监听
function initEventListeners() {
    // 点击弹窗外部关闭弹窗
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // 键盘事件
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                closeModal(modal.id);
            });
        }
    });
}

// ==================== UI 更新 ====================

function updateUI() {
    // 更新星星数量显示
    document.getElementById('starCount').textContent = appState.totalStars;
    
    // 更新模式按钮状态
    const homeBtn = document.getElementById('homeMode');
    const awayBtn = document.getElementById('awayMode');
    
    homeBtn.classList.toggle('active', appState.mode === 'home');
    awayBtn.classList.toggle('active', appState.mode === 'away');
    awayBtn.classList.toggle('away-active', appState.mode === 'away');
    
    // 更新body的模式class
    document.body.classList.toggle('away-mode', appState.mode === 'away');
    
    // 更新在外星星数量提示
    const awayStarsCount = getAwayStarsCount();
    const awayHint = document.getElementById('awayStarsHint');
    document.getElementById('awayStarsCount').textContent = awayStarsCount.added;
    awayHint.classList.toggle('visible', awayStarsCount.added > 0);
    
    // 更新同步按钮状态
    const syncBtn = document.getElementById('syncBtn');
    const hasUnsyncedAwayRecords = appState.records.some(r => r.mode === 'away' && !r.synced);
    syncBtn.style.display = hasUnsyncedAwayRecords ? 'flex' : 'none';
    
    // 渲染星星黑板
    renderStarsGrid();
}

// 渲染星星黑板上的星星
function renderStarsGrid() {
    const grid = document.getElementById('starsGrid');
    const emptyState = document.getElementById('emptyBlackboard');
    
    // 直接根据 totalStars 来渲染星星数量
    const totalStars = appState.totalStars;
    
    // 显示/隐藏空状态
    if (totalStars <= 0) {
        grid.innerHTML = '';
        emptyState.classList.add('visible');
        return;
    }
    
    emptyState.classList.remove('visible');
    
    // 获取最近30天的 add 记录，用于标记星星状态（在家/在外）
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentAddRecords = appState.records
        .filter(r => r.type === 'add' && r.timestamp >= thirtyDaysAgo)
        .sort((a, b) => a.timestamp - b.timestamp); // 从旧到新排序
    
    // 生成星星数据
    const starsData = [];
    
    // 首先用最近30天的 add 记录填充
    for (let i = 0; i < Math.min(recentAddRecords.length, totalStars); i++) {
        starsData.push(recentAddRecords[i]);
    }
    
    // 如果星星总数大于最近记录数，用默认状态填充剩余的
    const remaining = totalStars - starsData.length;
    for (let i = 0; i < remaining; i++) {
        starsData.unshift({
            id: `default-${i}`,
            reason: '历史积累',
            timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000, // 30天前
            mode: 'home',
            synced: true
        });
    }
    
    // 渲染每颗星星
    grid.innerHTML = starsData.map((record, index) => {
        // 判断星星类型
        const isAway = record.mode === 'away';
        const isSynced = record.synced;
        
        let starClass = 'star-item';
        let starEmoji = '⭐';
        
        if (isAway && !isSynced) {
            starClass += ' away';
            starEmoji = '🌟'; // 在外获得的用不同的星星
        } else {
            starClass += ' home';
            if (isAway && isSynced) {
                starClass += ' synced';
            }
        }
        
        const delay = Math.min(index * 0.03, 0.5); // 动画延迟，最多0.5秒
        
        return `
            <span class="${starClass}" 
                  data-id="${record.id}"
                  data-reason="${escapeHtml(record.reason)}"
                  data-time="${formatTime(record.timestamp)}"
                  data-mode="${record.mode}"
                  style="animation-delay: ${delay}s"
                  onclick="showStarDetail(this)">
                ${starEmoji}
            </span>
        `;
    }).join('');
}

// 显示星星详情
function showStarDetail(element) {
    const reason = element.dataset.reason;
    const time = element.dataset.time;
    const mode = element.dataset.mode;
    
    // 移除之前的tooltip
    const oldTooltip = document.querySelector('.star-tooltip');
    if (oldTooltip) oldTooltip.remove();
    
    // 创建tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'star-tooltip';
    
    const modeText = mode === 'away' ? ' <span style="color: #FF6B9D;">✈️ 在外</span>' : ' 🏠 在家';
    tooltip.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${reason}</div>
        <div style="font-size: 11px; opacity: 0.8;">${time}${modeText}</div>
    `;
    
    document.body.appendChild(tooltip);
    
    // 定位tooltip
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 10;
    
    // 确保不超出屏幕
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) {
        top = rect.bottom + 10;
        tooltip.style.transform = 'none';
        tooltip.querySelector('::before')?.remove();
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    
    // 3秒后自动消失
    setTimeout(() => {
        tooltip.remove();
    }, 3000);
    
    // 点击其他地方消失
    const removeTooltip = (e) => {
        if (!tooltip.contains(e.target) && e.target !== element) {
            tooltip.remove();
            document.removeEventListener('click', removeTooltip);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', removeTooltip);
    }, 100);
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 获取在外获得的星星统计
function getAwayStarsCount() {
    const awayRecords = appState.records.filter(r => r.mode === 'away' && !r.synced);
    const added = awayRecords.filter(r => r.type === 'add').length;
    const removed = awayRecords.filter(r => r.type === 'remove').length;
    return {
        added,
        removed,
        net: added - removed,
        total: awayRecords.length
    };
}

// ==================== 模式切换 ====================

function switchMode(mode) {
    if (appState.mode === mode) return;
    
    appState.mode = mode;
    saveData();
    updateUI();
    
    // 显示切换提示
    const modeText = mode === 'home' ? '在家模式 🏠' : '在外模式 ✈️';
    showToast(`已切换到${modeText}`);
    
    // 切换动画 - 让黑板闪烁一下
    const blackboard = document.querySelector('.star-blackboard');
    blackboard.style.transition = 'transform 0.3s ease';
    blackboard.style.transform = 'scale(0.98)';
    setTimeout(() => {
        blackboard.style.transform = 'scale(1)';
    }, 150);
}

// ==================== 星星操作 ====================

// 显示添加星星弹窗
function showAddModal() {
    document.getElementById('addCustomArea').style.display = 'none';
    document.getElementById('addCustomReason').value = '';
    openModal('addModal');
}

// 显示减少星星弹窗
function showRemoveModal() {
    if (appState.totalStars <= 0) {
        showToast('已经没有星星了 😢');
        return;
    }
    document.getElementById('removeCustomArea').style.display = 'none';
    document.getElementById('removeCustomReason').value = '';
    openModal('removeModal');
}

// 显示自定义原因输入框
function showCustomReason(type) {
    const areaId = type === 'add' ? 'addCustomArea' : 'removeCustomArea';
    const area = document.getElementById(areaId);
    area.style.display = area.style.display === 'none' ? 'flex' : 'none';
    
    if (area.style.display === 'flex') {
        const inputId = type === 'add' ? 'addCustomReason' : 'removeCustomReason';
        document.getElementById(inputId).focus();
    }
}

// 添加星星
function addStar(reason) {
    const record = {
        id: generateId(),
        type: 'add',
        reason: reason,
        timestamp: Date.now(),
        mode: appState.mode,
        synced: appState.mode === 'home' // 在家模式自动标记为已同步
    };
    
    appState.records.unshift(record);
    appState.totalStars++;
    saveData();
    updateUI();
    
    // 播放动画
    playStarAnimation('add');
    
    // 显示提示
    const modeHint = appState.mode === 'away' ? ' (在外)' : '';
    showToast(`获得1颗星星！⭐${modeHint}`);
    
    closeModal('addModal');
}

// 自定义原因添加星星
function addStarCustom() {
    const reason = document.getElementById('addCustomReason').value.trim();
    if (!reason) {
        showToast('请输入原因');
        return;
    }
    addStar(reason);
}

// 减少星星
function removeStar(reason) {
    if (appState.totalStars <= 0) {
        showToast('已经没有星星了');
        closeModal('removeModal');
        return;
    }
    
    const record = {
        id: generateId(),
        type: 'remove',
        reason: reason,
        timestamp: Date.now(),
        mode: appState.mode,
        synced: appState.mode === 'home',
        deleteReason: appState.mode === 'away' ? reason : null
    };
    
    appState.records.unshift(record);
    appState.totalStars--;
    saveData();
    updateUI();
    
    // 播放动画
    playStarAnimation('remove');
    
    // 显示提示
    const modeHint = appState.mode === 'away' ? ' (在外)' : '';
    showToast(`失去1颗星星 😢${modeHint}`);
    
    closeModal('removeModal');
}

// 自定义原因减少星星
function removeStarCustom() {
    const reason = document.getElementById('removeCustomReason').value.trim();
    if (!reason) {
        showToast('请输入原因');
        return;
    }
    removeStar(reason);
}

// ==================== 历史记录 ====================

let currentFilter = 'all';

function showHistory() {
    currentFilter = 'all';
    renderHistory();
    openModal('historyModal');
    
    // 更新筛选按钮状态
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('.filter-btn').classList.add('active');
}

function filterHistory(filter) {
    currentFilter = filter;
    renderHistory();
    
    // 更新筛选按钮状态
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(getFilterText(filter))) {
            btn.classList.add('active');
        }
    });
}

function getFilterText(filter) {
    const texts = {
        'all': '全部',
        'add': '获得',
        'remove': '失去',
        'away': '在外'
    };
    return texts[filter] || '全部';
}

function renderHistory() {
    const container = document.getElementById('historyList');
    let records = [...appState.records];
    
    // 应用筛选
    if (currentFilter === 'add') {
        records = records.filter(r => r.type === 'add');
    } else if (currentFilter === 'remove') {
        records = records.filter(r => r.type === 'remove');
    } else if (currentFilter === 'away') {
        records = records.filter(r => r.mode === 'away');
    }
    
    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-history">
                <div class="empty-icon">📭</div>
                <p>暂无记录</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = records.map(record => {
        const icon = record.type === 'add' ? '⭐' : '💔';
        const typeClass = record.type;
        const awayClass = record.mode === 'away' && !record.synced ? 'away' : '';
        const syncedClass = record.synced && record.mode === 'away' ? 'synced' : '';
        const time = formatTime(record.timestamp);
        
        let badge = '';
        if (record.mode === 'away' && !record.synced) {
            badge = '<span class="history-badge away">在外</span>';
        } else if (record.mode === 'away' && record.synced) {
            badge = '<span class="history-badge synced">已同步</span>';
        }
        
        let reasonText = record.reason;
        if (record.type === 'remove' && record.mode === 'away' && record.deleteReason) {
            reasonText += ` <span style="color: #FF4757; font-size: 12px;">(删除原因: ${record.deleteReason})</span>`;
        }
        
        return `
            <div class="history-item ${typeClass} ${awayClass} ${syncedClass}">
                <span class="history-icon">${icon}</span>
                <div class="history-info">
                    <div class="history-reason">${reasonText}</div>
                    <div class="history-time">${time}</div>
                </div>
                ${badge}
            </div>
        `;
    }).join('');
}

// ==================== 同步到黑板 ====================

function showSyncModal() {
    const awayCounts = getAwayStarsCount();
    
    if (awayCounts.total === 0) {
        showToast('没有需要同步的星星');
        return;
    }
    
    document.getElementById('syncAddCount').textContent = awayCounts.added;
    document.getElementById('syncRemoveCount').textContent = awayCounts.removed;
    
    // 渲染同步详情
    const awayRecords = appState.records.filter(r => r.mode === 'away' && !r.synced);
    const detailsContainer = document.getElementById('syncDetails');
    
    detailsContainer.innerHTML = awayRecords.map(record => {
        const icon = record.type === 'add' ? '➕ ⭐' : '➖ 💔';
        const time = formatTime(record.timestamp);
        return `
            <div class="sync-detail-item">
                <span>${icon}</span>
                <span style="flex: 1;">${record.reason}</span>
                <span style="color: var(--text-secondary); font-size: 12px;">${time}</span>
            </div>
        `;
    }).join('');
    
    openModal('syncModal');
}

function syncToBlackboard() {
    // 将所有在外的未同步记录标记为已同步
    appState.records.forEach(record => {
        if (record.mode === 'away' && !record.synced) {
            record.synced = true;
        }
    });
    
    saveData();
    updateUI();
    closeModal('syncModal');
    
    showToast('已同步到黑板！✏️📋');
    
    // 播放庆祝动画
    for (let i = 0; i < 5; i++) {
        setTimeout(() => playStarAnimation('add'), i * 200);
    }
}

// ==================== 外出快照 ====================

// 记录原始APP中的星星数（用于比较）
let originalAppStarCount = 0;

function showSnapshot() {
    // 更新日期
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    document.getElementById('snapshotDate').textContent = dateStr;
    
    // 记录当前APP的星星数
    originalAppStarCount = appState.totalStars;
    
    // 设置输入框的值为当前星星数
    document.getElementById('snapshotTotal').value = appState.totalStars;
    document.getElementById('currentAppCount').textContent = appState.totalStars;
    
    // 更新差异提示
    updateDiffHint();
    
    // 渲染最近记录
    renderRecentRecords();
    
    openModal('snapshotModal');
}

// 渲染最近记录
function renderRecentRecords() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRecords = appState.records.filter(r => r.timestamp >= thirtyDaysAgo);
    const recentContainer = document.getElementById('recentRecords');
    const displayRecords = recentRecords.slice(0, 5);
    
    if (displayRecords.length === 0) {
        recentContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 13px;">暂无最近记录</p>';
    } else {
        recentContainer.innerHTML = displayRecords.map(record => {
            const icon = record.type === 'add' ? '⭐' : '💔';
            const date = formatDateChinese(record.timestamp);
            return `
                <div class="recent-record-item">
                    <span>${icon}</span>
                    <span style="flex: 1; font-size: 13px;">${record.reason}</span>
                    <span style="color: var(--text-secondary); font-size: 12px;">${date}</span>
                </div>
            `;
        }).join('');
    }
}

// 更新差异提示
function updateDiffHint() {
    const input = document.getElementById('snapshotTotal');
    const diffHint = document.getElementById('diffHint');
    const newValue = parseInt(input.value) || 0;
    const diff = newValue - originalAppStarCount;
    
    if (diff > 0) {
        diffHint.textContent = `+${diff}`;
        diffHint.className = 'diff-hint positive';
    } else if (diff < 0) {
        diffHint.textContent = `${diff}`;
        diffHint.className = 'diff-hint negative';
    } else {
        diffHint.textContent = '';
        diffHint.className = 'diff-hint';
    }
}

// 快照星星数量输入变化
function onSnapshotCountChange() {
    updateDiffHint();
}

// 开始旅行 - 同步黑板数据到APP
function startTravel() {
    const input = document.getElementById('snapshotTotal');
    const newValue = parseInt(input.value) || 0;
    const diff = newValue - appState.totalStars;
    
    if (diff !== 0) {
        // 需要同步星星数量
        syncStarsToApp(newValue, diff);
    }
    
    // 切换到在外模式
    appState.mode = 'away';
    
    // 保存快照数据
    appState.lastSnapshot = {
        timestamp: Date.now(),
        totalStars: newValue,
        records: [...appState.records]
    };
    
    saveData();
    updateUI();
    closeModal('snapshotModal');
    
    // 显示提示
    showToast('旅途愉快！✈️ 已切换到在外模式');
    
    // 播放动画
    for (let i = 0; i < 3; i++) {
        setTimeout(() => playStarAnimation('add'), i * 150);
    }
}

// 同步星星数量到APP（生成对应的记录）
function syncStarsToApp(targetCount, diff) {
    const now = Date.now();
    
    if (diff > 0) {
        // 需要增加星星 - 生成"黑板同步"记录
        for (let i = 0; i < diff; i++) {
            const record = {
                id: generateId(),
                type: 'add',
                reason: '黑板同步',
                timestamp: now - (diff - i), // 稍微错开时间
                mode: 'home',
                synced: true
            };
            appState.records.unshift(record);
        }
    } else if (diff < 0) {
        // 需要减少星星 - 生成"黑板同步（校正）"记录
        const removeCount = Math.abs(diff);
        for (let i = 0; i < removeCount; i++) {
            const record = {
                id: generateId(),
                type: 'remove',
                reason: '黑板同步（校正）',
                timestamp: now - (removeCount - i),
                mode: 'home',
                synced: true
            };
            appState.records.unshift(record);
        }
    }
    
    // 更新总数
    appState.totalStars = targetCount;
}

// ==================== 心愿系统 ====================

// 显示心愿列表
function showWishList() {
    // 更新当前星星数
    document.getElementById('wishCurrentStars').textContent = appState.totalStars;
    
    // 渲染心愿列表
    renderWishList();
    
    openModal('wishListModal');
}

// 渲染心愿列表
function renderWishList() {
    const container = document.getElementById('wishList');
    
    if (appState.wishes.length === 0) {
        container.innerHTML = `
            <div class="empty-wishes">
                <div class="empty-icon">🌟</div>
                <p>还没有心愿哦~</p>
                <p class="hint">许一个心愿，然后努力攒星星吧！</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appState.wishes.map(wish => {
        const progress = Math.min((appState.totalStars / wish.starsNeeded) * 100, 100);
        const canFulfill = appState.totalStars >= wish.starsNeeded;
        const progressClass = canFulfill ? 'complete' : '';
        
        return `
            <div class="wish-item" data-id="${wish.id}">
                <div class="wish-item-header">
                    <div class="wish-name">${escapeHtml(wish.name)}</div>
                    <div class="wish-actions">
                        <button class="wish-action-btn" onclick="editWish('${wish.id}')" title="编辑">✏️</button>
                        <button class="wish-action-btn delete" onclick="deleteWish('${wish.id}')" title="删除">🗑️</button>
                    </div>
                </div>
                <div class="wish-progress">
                    <div class="progress-bar">
                        <div class="progress-fill ${progressClass}" style="width: ${progress}%"></div>
                    </div>
                    <div class="wish-progress-text">
                        <span class="current">已有 ${appState.totalStars} 颗</span>
                        <span class="needed">需要 ${wish.starsNeeded} 颗</span>
                    </div>
                </div>
                <button class="fulfill-wish-btn ${canFulfill ? 'ready' : 'not-ready'}" 
                        onclick="${canFulfill ? `showFulfillModal('${wish.id}')` : ''}"
                        ${canFulfill ? '' : 'disabled'}>
                    ${canFulfill ? '🎉 可以实现啦！' : `还差 ${wish.starsNeeded - appState.totalStars} 颗星星`}
                </button>
            </div>
        `;
    }).join('');
}

// 显示添加心愿弹窗
function showAddWishModal() {
    document.getElementById('wishModalTitle').textContent = '✨ 许个心愿';
    document.getElementById('wishNameInput').value = '';
    document.getElementById('wishAmountInput').value = '10';
    document.getElementById('editWishId').value = '';
    
    closeModal('wishListModal');
    openModal('addWishModal');
}

// 编辑心愿
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

// 调整心愿星星数量
function adjustWishAmount(delta) {
    const input = document.getElementById('wishAmountInput');
    let value = parseInt(input.value) || 0;
    value += delta;
    if (value < 1) value = 1;
    if (value > 999) value = 999;
    input.value = value;
}

// 设置心愿星星数量
function setWishAmount(amount) {
    document.getElementById('wishAmountInput').value = amount;
}

// 保存心愿
function saveWish() {
    const name = document.getElementById('wishNameInput').value.trim();
    const starsNeeded = parseInt(document.getElementById('wishAmountInput').value) || 10;
    const editId = document.getElementById('editWishId').value;
    
    if (!name) {
        showToast('请输入心愿内容');
        return;
    }
    
    if (starsNeeded < 1) {
        showToast('星星数量至少为1');
        return;
    }
    
    if (editId) {
        // 编辑现有心愿
        const wish = appState.wishes.find(w => w.id === editId);
        if (wish) {
            wish.name = name;
            wish.starsNeeded = starsNeeded;
            showToast('心愿已更新 ✨');
        }
    } else {
        // 添加新心愿
        const wish = {
            id: generateId(),
            name: name,
            starsNeeded: starsNeeded,
            createdAt: Date.now()
        };
        appState.wishes.push(wish);
        showToast('心愿已许下 🌟');
    }
    
    saveData();
    closeModal('addWishModal');
    showWishList();
}

// 删除心愿
function deleteWish(wishId) {
    if (!confirm('确定要删除这个心愿吗？')) return;
    
    appState.wishes = appState.wishes.filter(w => w.id !== wishId);
    saveData();
    renderWishList();
    showToast('心愿已删除');
}

// 显示兑现心愿确认弹窗
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

// 确认兑现心愿
function confirmFulfillWish() {
    const wishId = document.getElementById('fulfillWishId').value;
    const wish = appState.wishes.find(w => w.id === wishId);
    
    if (!wish) return;
    
    if (appState.totalStars < wish.starsNeeded) {
        showToast('星星不够哦~');
        return;
    }
    
    // 扣除星星
    appState.totalStars -= wish.starsNeeded;
    
    // 添加记录
    const record = {
        id: generateId(),
        type: 'remove',
        reason: `实现心愿：${wish.name}`,
        timestamp: Date.now(),
        mode: appState.mode,
        synced: appState.mode === 'home'
    };
    appState.records.unshift(record);
    
    // 将心愿移到已实现列表
    const fulfilledWish = {
        ...wish,
        fulfilledAt: Date.now(),
        starsUsed: wish.starsNeeded
    };
    appState.fulfilledWishes.unshift(fulfilledWish);
    
    // 从心愿列表中移除
    appState.wishes = appState.wishes.filter(w => w.id !== wishId);
    
    saveData();
    updateUI();
    closeModal('fulfillWishModal');
    
    // 播放庆祝动画
    playCelebration();
    
    showToast(`🎉 恭喜！心愿「${wish.name}」已实现！`);
}

// 显示已实现心愿列表
function showFulfilledWishes() {
    const container = document.getElementById('fulfilledWishList');
    
    if (appState.fulfilledWishes.length === 0) {
        container.innerHTML = `
            <div class="empty-wishes">
                <div class="empty-icon">🏆</div>
                <p>还没有实现的心愿</p>
                <p class="hint">继续努力，你可以的！</p>
            </div>
        `;
    } else {
        container.innerHTML = appState.fulfilledWishes.map(wish => {
            const date = formatDateChinese(wish.fulfilledAt);
            return `
                <div class="fulfilled-item">
                    <div class="fulfilled-icon">🎁</div>
                    <div class="fulfilled-info">
                        <div class="fulfilled-name">${escapeHtml(wish.name)}</div>
                        <div class="fulfilled-details">花费 ${wish.starsUsed} 颗星星</div>
                    </div>
                    <div class="fulfilled-date">${date}</div>
                </div>
            `;
        }).join('');
    }
    
    closeModal('wishListModal');
    openModal('fulfilledWishesModal');
}

// 播放庆祝动画
function playCelebration() {
    const celebration = document.createElement('div');
    celebration.className = 'celebration';
    document.body.appendChild(celebration);
    
    const emojis = ['🎉', '🎊', '⭐', '🌟', '✨', '🎁', '🏆', '💫'];
    
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
        celebration.appendChild(confetti);
    }
    
    // 3秒后移除庆祝动画
    setTimeout(() => {
        celebration.remove();
    }, 5000);
}

// ==================== 弹窗控制 ====================

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.body.style.overflow = '';
}

// ==================== 动画效果 ====================

function playStarAnimation(type) {
    const container = document.getElementById('starAnimationContainer');
    const star = document.createElement('div');
    star.className = type === 'add' ? 'flying-star' : 'falling-star';
    star.textContent = type === 'add' ? '⭐' : '💔';
    
    // 随机位置
    const startX = Math.random() * window.innerWidth * 0.6 + window.innerWidth * 0.2;
    const startY = window.innerHeight * 0.4;
    
    star.style.left = startX + 'px';
    star.style.top = startY + 'px';
    
    container.appendChild(star);
    
    // 动画结束后移除
    setTimeout(() => {
        star.remove();
    }, 1000);
}

// ==================== 工具函数 ====================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 格式化日期为中文格式：x月x日
function formatDateChinese(timestamp) {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ==================== 调试功能（开发用） ====================

// 可在控制台调用这些函数进行调试
window.debugStarApp = {
    getState: () => appState,
    resetData: () => {
        if (confirm('确定要重置所有数据吗？')) {
            resetData();
            updateUI();
            showToast('数据已重置');
        }
    },
    addTestData: () => {
        // 添加一些测试数据 - 模拟最近30天的记录
        const reasons = ['按时吃饭', '按时睡觉', '参加运动'];
        const now = Date.now();
        
        // 添加20颗星星的记录（大部分是add）
        for (let i = 0; i < 25; i++) {
            const isAdd = Math.random() > 0.2; // 80%概率获得星星
            const daysAgo = Math.floor(Math.random() * 28); // 最近28天
            const isAway = Math.random() > 0.75; // 25%概率是在外
            
            const record = {
                id: generateId(),
                type: isAdd ? 'add' : 'remove',
                reason: isAdd ? reasons[Math.floor(Math.random() * 3)] : '没有' + reasons[Math.floor(Math.random() * 3)],
                timestamp: now - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000,
                mode: isAway ? 'away' : 'home',
                synced: isAway ? Math.random() > 0.5 : true, // 在外的一半未同步
                deleteReason: (!isAdd && isAway) ? '没有' + reasons[Math.floor(Math.random() * 3)] : null
            };
            appState.records.push(record);
            if (isAdd) appState.totalStars++;
            else if (appState.totalStars > 0) appState.totalStars--;
        }
        
        // 确保星星数不为负
        if (appState.totalStars < 0) appState.totalStars = 0;
        
        appState.records.sort((a, b) => b.timestamp - a.timestamp);
        saveData();
        updateUI();
        showToast('已添加测试数据');
    }
};

// 防止页面缩放（移动端）
document.addEventListener('gesturestart', function (e) {
    e.preventDefault();
});

// 双击防止缩放
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
