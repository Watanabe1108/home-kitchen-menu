// ================= 1. 状态与初始化 =================
let recipeDB = {}; 
let dbUsers = JSON.parse(localStorage.getItem('scarlett_db_users')) || { 
    'Scarlett': { password: '123', role: 'admin', nickname: '店长Scarlett', favs: [] } 
};
let dbOrders = JSON.parse(localStorage.getItem('scarlett_db_orders')) || [];
let currentUser = localStorage.getItem('scarlett_active_user') || null;
let myCart = [];
let currentDetailingDish = "";
let currentCuisineID = 'chinese';

// 【修复】合并 window.onload，确保只加载一次
window.onload = function() {
    // 统一初始化：加载数据库 + 检查登录状态
    loadDishesFromServer(); 
    
    if (currentUser && dbUsers[currentUser]) {
        applyLoginUI();
    }
    
    // 默认进入中餐分类
    renderCategory('chinese');
};

// ================= 2. 后端同步 API =================

async function loadDishesFromServer() {
    try {
        const response = await fetch('/api/dishes');
        recipeDB = await response.json();
        // 如果数据库空，确保结构完整
        if (Object.keys(recipeDB).length === 0) {
            recipeDB = { 'chinese': { dishes: {} }, 'western': { dishes: {} }, 'japanese': { dishes: {} }, 'dessert': { dishes: {} } };
        }
        renderCategory(currentCuisineID);
    } catch (e) {
        showToast("❌ 无法连接后端数据库");
    }
}

// 【修复】对接后端的保存逻辑
async function saveAndClose() {
    const nameInput = document.getElementById('edit-dish-name');
    if (!nameInput) return closeDishDetails();
    
    const newName = nameInput.value.trim();
    if (!newName) return showToast("名字不能空着呀");

    const dish = getActiveDishObject();
    const payload = {
        old_name: currentDetailingDish,
        name: newName,
        price: dish.p,
        category: currentCuisineID,
        ingredients: dish.i,
        steps: dish.s,
        tips: dish.tips,
        image_data: dish.img
    };

    try {
        const response = await fetch('/api/save_dish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            currentDetailingDish = newName;
            await loadDishesFromServer();
            closeDishDetails();
            showToast("✅ 已永久存入数据库");
        }
    } catch (e) {
        showToast("⚠️ 保存失败，检查网络");
    }
}

// 【修复】对接后端的删除逻辑
async function deleteDish() {
    if (!confirm(`确定要永久删除【${currentDetailingDish}】吗？`)) return;
    try {
        await fetch('/api/delete_dish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: currentDetailingDish })
        });
        await loadDishesFromServer();
        closeDishDetails();
        showToast("🗑️ 已从数据库移除");
    } catch (e) {
        showToast("⚠️ 删除失败");
    }
}

// ================= 3. 详情页渲染逻辑 =================

function openDishDetails(name) {
    currentDetailingDish = name;
    let dish = getActiveDishObject();
    if (!dish) return;

    const isAdmin = currentUser && dbUsers[currentUser] && dbUsers[currentUser].role === 'admin';
    document.getElementById('modal-img').src = dish.img || '';
    document.getElementById('modal-title').innerText = name;
    
    renderReadMode(dish);

    const favBtn = document.getElementById('fav-btn');
    if (isAdmin) {
        favBtn.innerText = "✎ 编辑菜谱";
        favBtn.style.color = "#fbc531";
    } else {
        const isFav = currentUser && dbUsers[currentUser].favs.includes(name);
        favBtn.innerText = isFav ? "❤️ 已收藏" : "🤍 收藏";
        favBtn.style.color = isFav ? "#ff4757" : "#666";
    }

    const modal = document.getElementById('dish-modal');
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; modal.querySelector('.modal-content').style.transform = 'translateY(0)'; }, 10);
}

function renderReadMode(dish) {
    if(document.getElementById('admin-image-edit')) document.getElementById('admin-image-edit').style.display = 'none';
    
    document.getElementById('modal-price').innerHTML = `<div style="font-size:20px; color:#ff4757; font-weight:bold;">单价：$${dish.p}.00</div>`;
    document.getElementById('modal-ingredients').innerHTML = dish.i.map(item => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f9f9f9;"><span>${item.n}</span><span style="color:#999;">${item.q}</span></div>`).join('');
    document.getElementById('modal-steps').innerHTML = dish.s.map((step, idx) => `<div style="margin-bottom:12px;"><b style="color:#fbc531; margin-right:8px;">${idx+1}.</b>${step}</div>`).join('');

    const tipsArea = document.getElementById('modal-tips-area');
    if (dish.tips) {
        tipsArea.style.display = 'block';
        tipsArea.innerHTML = `<h4>💡 小Tips</h4><p style="font-size:14px; color:#666; font-style:italic;">${dish.tips}</p>`;
    } else {
        tipsArea.style.display = 'none';
    }
    const footer = document.querySelector('.modal-footer');
    footer.style.display = 'none'; // 顾客浏览时，彻底隐藏底部栏
    footer.innerHTML = '';
}

function renderEditMode(dish) {
    if(document.getElementById('admin-image-edit')) document.getElementById('admin-image-edit').style.display = 'flex';

    document.getElementById('modal-title').innerHTML = `<input type="text" id="edit-dish-name" value="${currentDetailingDish}" style="width:100%; font-size:18px; border:1px solid #fbc531; border-radius:8px; padding:5px;">`;
    document.getElementById('modal-price').innerHTML = `<h4>💰 价格 (元)</h4><input type="number" value="${dish.p}" style="width:100%; padding:10px; border:1px solid #fbc531; border-radius:10px;" oninput="updatePriceData(this.value)">`;

    let iHtml = `<div id="edit-i-list">`;
    dish.i.forEach((item, index) => {
        iHtml += `<div class="edit-item-row" style="display:flex; gap:5px; margin-bottom:8px;"><input type="text" value="${item.n}" placeholder="食材" style="flex:2;" oninput="updateIData(${index}, 'n', this.value)"><input type="text" value="${item.q}" placeholder="量" style="flex:1;" oninput="updateIData(${index}, 'q', this.value)"><span onclick="removeDetailItem('i', ${index})" style="color:red; cursor:pointer;">✕</span></div>`;
    });
    document.getElementById('modal-ingredients').innerHTML = iHtml + `</div><button class="add-detail-btn" onclick="addDetailItem('i')">+ 添加原料</button>`;

    let sHtml = `<div id="edit-s-list">`;
    dish.s.forEach((step, index) => {
        sHtml += `<div class="edit-item-row" style="display:flex; gap:5px; margin-bottom:8px;"><b style="color:#fbc531;">${index+1}</b><textarea style="flex:1;" oninput="updateSData(${index}, this.value)">${step}</textarea><span onclick="removeDetailItem('s', ${index})" style="color:red; cursor:pointer;">✕</span></div>`;
    });
    document.getElementById('modal-steps').innerHTML = sHtml + `</div><button class="add-detail-btn" onclick="addDetailItem('s')">+ 添加步骤</button>`;

    const tipsArea = document.getElementById('modal-tips-area');
    tipsArea.style.display = 'block';
    tipsArea.innerHTML = `<h4>💡 小Tips</h4><textarea style="width:100%; height:60px;" oninput="updateTipsData(this.value)">${dish.tips || ''}</textarea>`;
    
    const footer = document.querySelector('.modal-footer');
    footer.style.display = 'flex'; // 店长编辑时，恢复显示底部栏
    footer.innerHTML = `<button class="outline-btn" style="width:30%; margin:0; border-color:#ff7675; color:#ff7675;" onclick="deleteDish()">删除</button><button class="primary-btn" style="width:65%; margin:0;" onclick="saveAndClose()">保存修改</button>`;
}

// ================= 4. 工具函数 =================

function getActiveDishObject() { 
    if(!recipeDB[currentCuisineID]) return null;
    return recipeDB[currentCuisineID].dishes[currentDetailingDish]; 
}
function updateIData(idx, key, val) { getActiveDishObject().i[idx][key] = val; }
function updateSData(idx, val) { getActiveDishObject().s[idx] = val; }
function updateTipsData(val) { getActiveDishObject().tips = val; }
function updatePriceData(val) { getActiveDishObject().p = parseFloat(val) || 0; }

function addDetailItem(type) {
    const dish = getActiveDishObject();
    if (type === 'i') dish.i.push({n:'', q:''}); else dish.s.push('');
    renderEditMode(dish);
}
function removeDetailItem(type, idx) {
    const dish = getActiveDishObject();
    if (type === 'i') dish.i.splice(idx, 1); else dish.s.splice(idx, 1);
    renderEditMode(dish);
}

// ================= 全新的图片上传与压缩逻辑 =================
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 移除了之前 1MB 的限制，因为我们现在会自动压缩！
    showToast("图片压缩中，请稍候...");

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // 1. 设定图片最大尺寸 (800px 对于手机点餐界面已经非常高清了)
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            // 2. 等比例缩小尺寸
            if (width > height) {
                if (width > MAX_WIDTH) {
                    height = Math.round(height * (MAX_WIDTH / width));
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width = Math.round(width * (MAX_HEIGHT / height));
                    height = MAX_HEIGHT;
                }
            }

            // 3. 创建画板并绘制缩小后的图片
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // 填充白色背景（防止原图是透明底的 PNG 变成黑色背景）
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height);

            // 4. 核心魔法：导出为 JPEG 格式，画质压缩为 0.7
            // 0.7 是个黄金比例，通常能把 2-3MB 的照片压到 100kb-200kb 左右
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

            // 5. 更新数据和 UI
            getActiveDishObject().img = compressedDataUrl;
            document.getElementById('modal-img').src = compressedDataUrl;
            showToast("✅ 图片已压缩并预览！点保存生效");
            
            // 可选：在控制台打印压缩后的体积，让你心里有数
            const sizeInKB = Math.round((compressedDataUrl.length * (3/4)) / 1024);
            console.log(`压缩后图片大小约为: ${sizeInKB} KB`);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function removeDishImage() {
    getActiveDishObject().img = 'https://via.placeholder.com/400x200?text=No+Image';
    document.getElementById('modal-img').src = getActiveDishObject().img;
}

// ================= 5. 菜单渲染逻辑 (修复补全) =================

function renderCategory(catId) {
    const list = document.getElementById('full-dish-list');
    if(!list) return;
    list.innerHTML = `<p style="font-size:12px; color:#999; margin-bottom:15px;">${catId.toUpperCase()} 菜单</p>`;
    
    const catData = recipeDB[catId];
    if(!catData || !catData.dishes) return;
    const dishes = catData.dishes;
    const isAdmin = currentUser && dbUsers[currentUser] && dbUsers[currentUser].role === 'admin';

    // 【修复】补全真正的渲染循环
    for (let name in dishes) {
        let count = myCart.filter(item => item.n === name).length;
        let actionUI = count === 0 ? 
            `<div class="add-btn" onclick="event.stopPropagation(); addToCart('${name}', ${dishes[name].p})">+</div>` : 
            `<div class="counter-group" onclick="event.stopPropagation();">
                <button class="counter-btn" onclick="removeFromCart('${name}')">-</button>
                <span class="counter-num">${count}</span>
                <button class="counter-btn ${count>=3?'disabled':''}" onclick="addToCart('${name}', ${dishes[name].p})">+</button>
            </div>`;
        list.innerHTML += `
            <div class="dish-card" onclick="openDishDetails('${name}')">
                <img class="dish-img" src="${dishes[name].img || 'https://via.placeholder.com/400x200?text=No+Image'}">
                <div class="dish-info"><div class="dish-name">${name}</div><div class="dish-price">$${dishes[name].p}.00</div>${actionUI}</div>
            </div>`;
    }
    
    if (isAdmin) {
        list.innerHTML += `
            <div class="dish-card" onclick="createNewDish()" style="border: 2px dashed #fbc531; height:80px; display:flex; justify-content:center; align-items:center; border-radius:12px; cursor:pointer; background:#fff9e6; margin-bottom:30px;">
                <span style="color:#fbc531; font-weight:bold; font-size:14px;">+ 添加新菜品</span>
            </div>
        `;
    }
}

function createNewDish() {
    const newName = "新菜品" + Math.floor(Math.random()*100);
    if(!recipeDB[currentCuisineID]) recipeDB[currentCuisineID] = {dishes:{}};
    recipeDB[currentCuisineID].dishes[newName] = { p: 0, i: [], s: [], tips: '', img: '' };
    openDishDetails(newName);
    renderEditMode(recipeDB[currentCuisineID].dishes[newName]);
}

// ================= 6. 通用 UI 逻辑 =================

function addToCart(name, price) {
    if (myCart.filter(i => i.n === name).length >= 3) return showToast("⚠️ 限购 3 份");
    myCart.push({n: name, p: price}); updateAllUI();
}
function removeFromCart(name) {
    for (let i = myCart.length - 1; i >= 0; i--) if (myCart[i].n === name) { myCart.splice(i, 1); break; }
    updateAllUI();
}
function updateAllUI() {
    document.getElementById('cart-badge').innerText = myCart.length;
    renderCategory(currentCuisineID);
    if (document.getElementById('view-cart').style.display === 'flex') renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total');
    if (!container || !totalEl) return;

    // 清空旧内容
    container.innerHTML = '';
    
    if (myCart.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding-top:100px;">
                <div style="font-size:50px; margin-bottom:10px;">🛒</div>
                <p style="color:#bbb; font-size:14px;">购物车空空如也</p>
            </div>`;
        totalEl.innerText = '$0.00';
        return;
    }

    // 使用对象聚合数据（这比在循环里操作 DOM 快得多）
    let groups = {};
    let totalSum = 0;
    
    myCart.forEach(item => {
        if (!groups[item.n]) groups[item.n] = { p: item.p, count: 0 };
        groups[item.n].count++;
        totalSum += item.p;
    });

    let htmlBuffer = "";
    for (let name in groups) {
        const item = groups[name];
        htmlBuffer += `
            <div style="background:#fff; border-radius:15px; padding:15px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; border:1px solid #f5f5f5;">
                <div>
                    <div style="font-weight:bold; color:#333; margin-bottom:4px;">${name}</div>
                    <div style="color:#ff4757; font-size:14px; font-weight:bold;">$${item.p}.00</div>
                </div>
                <div style="display:flex; align-items:center; background:#f7f8fa; border-radius:20px; padding:4px 10px;">
                    <button onclick="removeFromCart('${name}'); renderCart();" style="border:none; background:none; font-size:18px; color:#fbc531; width:24px;">-</button>
                    <span style="margin:0 12px; font-weight:bold; font-size:15px;">${item.count}</span>
                    <button onclick="addToCart('${name}', ${item.p}); renderCart();" style="border:none; background:none; font-size:18px; color:#fbc531; width:24px;">+</button>
                </div>
            </div>`;
    }
    
    container.innerHTML = htmlBuffer;
    totalEl.innerText = '$' + totalSum.toFixed(2);
}

function changeSidebar(catId, el) {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active'); currentCuisineID = catId; renderCategory(catId);
}

function switchTab(v, e) {
    if(e) { document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active')); e.classList.add('active'); }
    ['view-menu','view-cart','view-order','view-profile'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById(v).style.display = (v==='view-menu'||v==='view-cart')?'flex':'block';
    document.getElementById('cart-fab').style.display = v==='view-menu'?'flex':'none';
    if(v==='view-order') renderOrders(); if(v==='view-cart') renderCart();
}

function toggleFavorite() {
    if (!currentUser) return showToast("请先登录！");
    if (dbUsers[currentUser].role === 'admin') { renderEditMode(getActiveDishObject()); return; }
    let favs = dbUsers[currentUser].favs; const idx = favs.indexOf(currentDetailingDish);
    if (idx > -1) favs.splice(idx, 1); else favs.push(currentDetailingDish);
    localStorage.setItem('scarlett_db_users', JSON.stringify(dbUsers)); openDishDetails(currentDetailingDish); renderFavs();
}

function handleLogin() {
    let u = document.getElementById('auth-username').value.trim();
    let p = document.getElementById('auth-password').value;
    
    if (u === 'Scarlett' && p === '123') {
        if (!dbUsers[u]) {
            dbUsers[u] = { password: '123', role: 'admin', nickname: '店长Scarlett', favs: [] };
            localStorage.setItem('scarlett_db_users', JSON.stringify(dbUsers));
        }
    }

    if (dbUsers[u] && dbUsers[u].password === p) {
        currentUser = u;
        localStorage.setItem('scarlett_active_user', u);
        applyLoginUI();
        renderCategory(currentCuisineID); 
        switchTab('view-menu', document.querySelectorAll('.nav-item')[0]);
        showToast("登录成功，店长请进！");
    } else {
        showToast("账号密码不对哦");
    }
}

function handleRegister() {
    let u = document.getElementById('auth-username').value.trim(); 
    let n = document.getElementById('auth-nickname').value.trim(); 
    let p = document.getElementById('auth-password').value;
    if (!u || !p) return showToast("没填全"); 
    if (dbUsers[u]) return showToast("已占用");
    dbUsers[u] = { password: p, role: 'guest', nickname: n || u, favs: [] };
    localStorage.setItem('scarlett_db_users', JSON.stringify(dbUsers)); 
    currentUser = u; 
    localStorage.setItem('scarlett_active_user', u); 
    applyLoginUI();
    renderCategory(currentCuisineID);
    switchTab('view-menu', document.querySelectorAll('.nav-item')[0]);
}

function applyLoginUI() {
    let u = dbUsers[currentUser]; 
    if(!u) return;
    document.getElementById('unlogged-box').style.display = 'none'; 
    document.getElementById('logged-box').style.display = 'block';
    document.getElementById('profile-display-name').innerText = u.nickname; 
    document.getElementById('profile-role').innerText = u.role==='admin'?"管理员":"访客"; 
    renderFavs();
}

function handleLogout() { localStorage.removeItem('scarlett_active_user'); location.reload(); }

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(t) { t.innerText = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2000); } 
}
function closeDishDetails() { 
    const modal = document.getElementById('dish-modal'); 
    modal.style.opacity = '0'; 
    setTimeout(() => modal.style.display = 'none', 200); 
}
function renderFavs() { 
    const l = document.getElementById('my-favorites-list'); 
    let f = (currentUser&&dbUsers[currentUser].favs)||[]; 
    if(l) l.innerHTML = f.length?f.join('、'):"暂无收藏"; 
}

// 1. 修改下单函数
async function handlePlaceOrderAttempt() {
    if(!currentUser) { 
        showToast("请先登录！"); 
        switchTab('view-profile', document.querySelectorAll('.nav-item')[2]); 
        return;
    }
    
    if(!myCart.length) return;

    let s = []; 
    let g = {}; 
    myCart.forEach(i => { if(!g[i.n]) g[i.n]=0; g[i.n]++; }); 
    for(let k in g) s.push(`${k} x${g[k]}`);

    const orderData = {
        user: currentUser,
        nick: dbUsers[currentUser].nickname,
        time: new Date().toLocaleString(),
        items: s.join(', '),
        total: document.getElementById('cart-total').innerText
    };

    // 【关键】发给后端 SQLite
    try {
        const response = await fetch('/api/place_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if (response.ok) {
            showToast("🚀 订单已传送到店长后台！");
            myCart = [];
            document.getElementById('cart-badge').innerText = '0';
            switchTab('view-order', document.querySelectorAll('.nav-item')[1]);
        }
    } catch (e) {
        showToast("❌ 下单失败，请检查网络");
    }
}

// 2. 修改渲染订单函数
async function renderOrders() {
    const listContainer = document.getElementById('order-history-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">正在同步订单...</p>';

    try {
        // 从后端获取所有订单
        const response = await fetch('/api/orders');
        const allOrders = await response.json();
        
        const isAdmin = currentUser && dbUsers[currentUser].role === 'admin';
        
        // 如果不是管理员，只看自己的订单
        const displayList = isAdmin ? allOrders : allOrders.filter(o => o.user === currentUser);

        listContainer.innerHTML = '';
        if (displayList.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">暂无订单记录</p>';
            return;
        }

        displayList.forEach(o => {
            listContainer.innerHTML += `
                <div class="history-card">
                    <div style="font-size:11px;color:#999;margin-bottom:8px;display:flex;justify-content:space-between;">
                        <span>${o.time}</span>
                        ${isAdmin ? `<b style="color:#fbc531;">顾客: ${o.nick}</b>` : ''}
                    </div>
                    <div style="font-size:14px; color:#333;">${o.items}</div>
                    <div style="text-align:right;font-weight:bold;color:#ff4757;margin-top:10px;">${o.total}</div>
                </div>`;
        });
    } catch (e) {
        listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:red;">订单同步失败</p>';
    }
}

// ================= 7. 个人资料修改逻辑 =================

// 切换显示/隐藏编辑框
function toggleEditInfo() {
    const box = document.getElementById('edit-info-box');
    if (!box) return;

    if (box.style.display === 'none' || box.style.display === '') {
        box.style.display = 'block';
        
        // 1. 填充灰色的用户名 (不可修改)
        document.getElementById('display-username').innerText = currentUser;
        
        // 2. 自动填入当前昵称到输入框
        const nickInput = document.getElementById('new-nickname');
        if (nickInput && currentUser) {
            nickInput.value = dbUsers[currentUser].nickname;
        }
    } else {
        box.style.display = 'none';
    }
}

// 【补全】真正执行昵称修改的函数
function updateNickname() {
    const input = document.getElementById('new-nickname');
    if (!input) return;
    
    const newNick = input.value.trim();
    if (!newNick) return showToast("昵称不能为空哦");

    // 1. 更新内存数据
    dbUsers[currentUser].nickname = newNick;
    
    // 2. 同步到本地存储（用户信息目前仍存在本地，方便手机端快速读取）
    localStorage.setItem('scarlett_db_users', JSON.stringify(dbUsers));
    
    // 3. 刷新 UI 显示
    applyLoginUI();
    
    // 4. 收起编辑框并提示
    toggleEditInfo();
    showToast("✨ 资料已更新");
}