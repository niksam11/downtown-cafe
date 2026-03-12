// ===== ADMIN DASHBOARD JS =====
document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('loginScreen');
    const dashboard = document.getElementById('adminDashboard');
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');

    let adminToken = localStorage.getItem('admin_token');

    // Check if already logged in
    if (adminToken) {
        showDashboard();
    }

    // Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('adminPassword').value;

        try {
            const data = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            }).then(r => r.json());

            if (data.success) {
                adminToken = data.token;
                localStorage.setItem('admin_token', adminToken);
                showDashboard();
            } else {
                showToast('Invalid password', 'error');
            }
        } catch (err) {
            showToast('Login failed', 'error');
        }
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('admin_token');
            adminToken = null;
            dashboard.style.display = 'none';
            loginScreen.style.display = '';
            document.getElementById('adminPassword').value = '';
        });
    }

    function showDashboard() {
        loginScreen.style.display = 'none';
        dashboard.style.display = '';
        loadDashboard();
    }

    // Sidebar navigation
    document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;

            document.querySelector('.sidebar-link.active')?.classList.remove('active');
            link.classList.add('active');

            document.querySelector('.admin-section.active')?.classList.remove('active');
            document.getElementById(`section-${section}`)?.classList.add('active');

            // Load data for section
            switch (section) {
                case 'dashboard': loadDashboard(); break;
                case 'orders': loadOrders(); break;
                case 'reservations': loadReservations(); break;
                case 'qrcodes': break; // Loaded on button click
                case 'menu-manage': loadMenuManage(); break;
            }
        });
    });

    // ===== DASHBOARD =====
    async function loadDashboard() {
        try {
            const stats = await adminApi('/api/admin/dashboard');
            const grid = document.getElementById('statsGrid');

            grid.innerHTML = `
                <div class="stat-card"><div class="stat-icon orange">📅</div><div class="stat-info"><span class="stat-value">${stats.todayReservations}</span><span class="stat-label">Today's Reservations</span></div></div>
                <div class="stat-card"><div class="stat-icon blue">📦</div><div class="stat-info"><span class="stat-value">${stats.todayOrders}</span><span class="stat-label">Today's Orders</span></div></div>
                <div class="stat-card"><div class="stat-icon green">💰</div><div class="stat-info"><span class="stat-value">${formatPrice(stats.todayRevenue)}</span><span class="stat-label">Today's Revenue</span></div></div>
                <div class="stat-card"><div class="stat-icon red">🔥</div><div class="stat-info"><span class="stat-value">${stats.activeOrders}</span><span class="stat-label">Active Orders</span></div></div>
                <div class="stat-card"><div class="stat-icon purple">🪑</div><div class="stat-info"><span class="stat-value">${stats.occupiedTables}/${stats.totalTables}</span><span class="stat-label">Occupied Tables</span></div></div>
                <div class="stat-card"><div class="stat-icon teal">📋</div><div class="stat-info"><span class="stat-value">${stats.totalReservations}</span><span class="stat-label">Total Reservations</span></div></div>
            `;

            // Load recent orders
            const ordersData = await adminApi('/api/admin/orders?status=pending');
            const recentOrders = document.getElementById('recentOrders');
            if (ordersData.orders.length === 0) {
                recentOrders.innerHTML = '<p class="empty-text">No pending orders</p>';
            } else {
                recentOrders.innerHTML = ordersData.orders.slice(0, 5).map(o => `
                    <div class="recent-item">
                        <div class="recent-info">
                            <strong>${o.order_number}</strong>
                            <span>Table ${o.table_number} • ${o.items.length} items</span>
                        </div>
                        <div class="recent-right">
                            <span class="recent-price">${formatPrice(o.total)}</span>
                            <span class="status-badge ${getStatusBadgeClass(o.status)}">${o.status}</span>
                        </div>
                    </div>
                `).join('');
            }

            // Load today's reservations
            const today = new Date().toISOString().split('T')[0];
            const resData = await adminApi(`/api/admin/reservations?date=${today}`);
            const recentRes = document.getElementById('recentReservations');
            if (resData.reservations.length === 0) {
                recentRes.innerHTML = '<p class="empty-text">No reservations today</p>';
            } else {
                recentRes.innerHTML = resData.reservations.slice(0, 5).map(r => `
                    <div class="recent-item">
                        <div class="recent-info">
                            <strong>${r.name}</strong>
                            <span>${formatTime(r.time_slot)} • Table ${r.table_number} • ${r.guests} guests</span>
                        </div>
                        <span class="status-badge ${getStatusBadgeClass(r.status)}">${r.status}</span>
                    </div>
                `).join('');
            }
        } catch (err) {
            console.error('Dashboard error:', err);
            showToast('Failed to load dashboard', 'error');
        }
    }

    // ===== ORDERS =====
    async function loadOrders() {
        try {
            const status = document.getElementById('orderStatusFilter')?.value || '';
            const date = document.getElementById('orderDateFilter')?.value || '';

            let url = '/api/admin/orders?';
            if (status) url += `status=${status}&`;
            if (date) url += `date=${date}&`;

            const data = await adminApi(url);
            const tbody = document.getElementById('ordersBody');

            if (data.orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No orders found</td></tr>';
                return;
            }

            tbody.innerHTML = data.orders.map(o => `
                <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>Table ${o.table_number}</td>
                    <td>${o.items.map(i => `${i.name} x${i.quantity}`).join(', ')}</td>
                    <td><strong>${formatPrice(o.total)}</strong></td>
                    <td><span class="status-badge ${getStatusBadgeClass(o.status)}">${o.status}</span></td>
                    <td>${formatDateTime(o.created_at)}</td>
                    <td>
                        <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
                            ${['pending','confirmed','preparing','ready','served','paid','cancelled'].map(s =>
                                `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            showToast('Failed to load orders', 'error');
        }
    }

    window.updateOrderStatus = async function (orderId, status) {
        try {
            await adminApi(`/api/admin/orders/${orderId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            showToast(`Order status updated to ${status}`, 'success');
        } catch (err) {
            showToast('Failed to update status', 'error');
            loadOrders(); // Refresh
        }
    };

    // Order filters
    document.getElementById('orderStatusFilter')?.addEventListener('change', loadOrders);
    document.getElementById('orderDateFilter')?.addEventListener('change', loadOrders);

    // ===== RESERVATIONS =====
    async function loadReservations() {
        try {
            const status = document.getElementById('resStatusFilter')?.value || '';
            const date = document.getElementById('resDateFilter')?.value || '';

            let url = '/api/admin/reservations?';
            if (status) url += `status=${status}&`;
            if (date) url += `date=${date}&`;

            const data = await adminApi(url);
            const tbody = document.getElementById('reservationsBody');

            if (data.reservations.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No reservations found</td></tr>';
                return;
            }

            tbody.innerHTML = data.reservations.map(r => `
                <tr>
                    <td><strong>${r.booking_id}</strong></td>
                    <td>${r.name}</td>
                    <td>${r.phone}</td>
                    <td>${formatDate(r.date)}</td>
                    <td>${formatTime(r.time_slot)}</td>
                    <td>Table ${r.table_number}</td>
                    <td>${r.guests}</td>
                    <td><span class="status-badge ${getStatusBadgeClass(r.status)}">${r.status}</span></td>
                    <td>
                        <select class="status-select" onchange="updateResStatus(${r.id}, this.value)">
                            ${['confirmed','completed','cancelled','no_show'].map(s =>
                                `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            showToast('Failed to load reservations', 'error');
        }
    }

    window.updateResStatus = async function (resId, status) {
        try {
            await adminApi(`/api/admin/reservations/${resId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            showToast(`Reservation updated to ${status}`, 'success');
        } catch (err) {
            showToast('Failed to update', 'error');
            loadReservations();
        }
    };

    document.getElementById('resStatusFilter')?.addEventListener('change', loadReservations);
    document.getElementById('resDateFilter')?.addEventListener('change', loadReservations);

    // ===== QR CODES =====
    document.getElementById('generateAllQR')?.addEventListener('click', async () => {
        const grid = document.getElementById('qrGrid');
        grid.innerHTML = '<p class="loading-text">Generating QR codes for all tables...</p>';

        try {
            const data = await adminApi('/api/admin/qr-all');
            grid.innerHTML = data.qr_codes.map(qr => `
                <div class="qr-card">
                    <img src="${qr.qr_code}" alt="Table ${qr.table_number} QR" class="qr-image">
                    <div class="qr-info">
                        <strong>Table ${qr.table_number}</strong>
                        <span>${qr.capacity} seater</span>
                    </div>
                    <a href="${qr.qr_code}" download="table-${qr.table_number}-qr.png" class="btn btn-outline btn-sm">Download</a>
                </div>
            `).join('');
        } catch (err) {
            showToast('Failed to generate QR codes', 'error');
            grid.innerHTML = '<p class="error-text">Failed to generate. Please try again.</p>';
        }
    });

    // ===== MENU MANAGEMENT =====
    async function loadMenuManage() {
        try {
            const data = await api('/api/menu');
            const container = document.getElementById('menuManageList');

            container.innerHTML = data.categories.map(cat => `
                <div class="manage-category">
                    <h4>${cat.icon || ''} ${cat.name}</h4>
                    <div class="manage-items">
                        ${cat.items.map(item => `
                            <div class="manage-item">
                                <div class="manage-item-info">
                                    <span class="diet-badge ${item.is_veg ? 'veg' : 'nonveg'}"><span class="diet-dot"></span></span>
                                    <span>${item.name}</span>
                                    <span class="manage-price">${formatPrice(item.price)}</span>
                                </div>
                                <label class="toggle-label">
                                    <input type="checkbox" ${item.is_available ? 'checked' : ''} onchange="toggleMenuItem(${item.id}, this.checked)">
                                    <span class="toggle-switch"></span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } catch (err) {
            showToast('Failed to load menu', 'error');
        }
    }

    window.toggleMenuItem = async function (itemId, available) {
        try {
            await adminApi(`/api/admin/menu/${itemId}`, {
                method: 'PUT',
                body: JSON.stringify({ is_available: available })
            });
            showToast(`Item ${available ? 'enabled' : 'disabled'}`, 'success', 2000);
        } catch (err) {
            showToast('Failed to update item', 'error');
        }
    };

    // Admin API helper
    async function adminApi(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Admin-Token': adminToken
        };

        const res = await fetch(url, { headers, ...options });
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem('admin_token');
                location.reload();
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    // Auto-refresh dashboard every 30 seconds
    setInterval(() => {
        const activeSection = document.querySelector('.admin-section.active');
        if (!activeSection || !adminToken) return;

        const sectionId = activeSection.id;
        switch (sectionId) {
            case 'section-dashboard': loadDashboard(); break;
            case 'section-orders': loadOrders(); break;
        }
    }, 30000);
});
