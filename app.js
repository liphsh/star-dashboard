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
    lastSnapshot: null      // 最后一次快照
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

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    updateUI();
    initEventListeners();
});

// 加载本地存储的数据
function loadData() {
    const savedData = localStorage.getItem('starWishPlan');
    if (savedData) {
        try {
            appState = JSON.parse(savedData);
            // 确保数据结构完整
            appState.records = appState.records || [];
            appState.totalStars = appState.totalStars || 0;
            appState.mode = appState.mode || 'home';
        } catch (e) {
            console.error('数据加载失败，使用默认数据');
            resetData();
        }
    }
}

// 保存数据到本地存储
function saveData() {
    localStorage.setItem('starWishPlan', JSON.stringify(appState));
}

// 重置数据
function resetData() {
    appState = {
        totalStars: 0,
        mode: 'home',
        records: [],
        lastSnapshot: null
    };
    saveData();
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
    
    // 获取最近30天的有效星星（计算净值）
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRecords = appState.records.filter(r => r.timestamp >= thirtyDaysAgo);
    
    // 按时间排序（从旧到新）
    const sortedRecords = [...recentRecords].sort((a, b) => a.timestamp - b.timestamp);
    
    // 计算每颗星星的状态
    // 使用栈来追踪星星：add 压入，remove 弹出
    const starStack = [];
    
    sortedRecords.forEach(record => {
        if (record.type === 'add') {
            starStack.push(record);
        } else if (record.type === 'remove' && starStack.length > 0) {
            // 移除最新的一颗星星
            starStack.pop();
        }
    });
    
    // 显示/隐藏空状态
    if (starStack.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.add('visible');
        return;
    }
    
    emptyState.classList.remove('visible');
    
    // 渲染每颗星星
    grid.innerHTML = starStack.map((record, index) => {
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
        
        const delay = Math.min(index * 0.05, 1); // 动画延迟，最多1秒
        
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

function showSnapshot() {
    // 更新日期
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    document.getElementById('snapshotDate').textContent = dateStr;
    
    // 更新星星总数
    document.getElementById('snapshotTotal').textContent = appState.totalStars;
    
    // 计算最近30天的统计
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRecords = appState.records.filter(r => r.timestamp >= thirtyDaysAgo);
    
    const monthAdd = recentRecords.filter(r => r.type === 'add').length;
    const monthRemove = recentRecords.filter(r => r.type === 'remove').length;
    const monthNet = monthAdd - monthRemove;
    
    document.getElementById('monthAdd').textContent = monthAdd;
    document.getElementById('monthRemove').textContent = monthRemove;
    document.getElementById('monthNet').textContent = (monthNet >= 0 ? '+' : '') + monthNet;
    document.getElementById('monthNet').style.color = monthNet >= 0 ? 'var(--primary-green)' : 'var(--deleted-color)';
    
    // 渲染最近记录
    const recentContainer = document.getElementById('recentRecords');
    const displayRecords = recentRecords.slice(0, 10);
    
    if (displayRecords.length === 0) {
        recentContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无最近记录</p>';
    } else {
        recentContainer.innerHTML = `
            <h4>📝 最近记录</h4>
            ${displayRecords.map(record => {
                const icon = record.type === 'add' ? '⭐' : '💔';
                const date = formatDate(record.timestamp);
                return `
                    <div class="recent-record-item">
                        <span>${icon}</span>
                        <span style="flex: 1;">${record.reason}</span>
                        <span style="color: var(--text-secondary);">${date}</span>
                    </div>
                `;
            }).join('')}
        `;
    }
    
    openModal('snapshotModal');
}

function saveSnapshot() {
    // 保存快照数据
    appState.lastSnapshot = {
        timestamp: Date.now(),
        totalStars: appState.totalStars,
        records: [...appState.records]
    };
    saveData();
    
    // 由于是纯前端应用，这里提示用户截图
    showToast('请截图保存此快照 📸');
    
    // 高亮快照卡片
    const card = document.querySelector('.snapshot-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'pulse 0.5s ease';
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
