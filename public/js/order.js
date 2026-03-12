// ===== QR ORDER PAGE JS =====
document.addEventListener('DOMContentLoaded', async () => {
    // Get table number from URL
    const params = new URLSearchParams(window.location.search);
    const tableNumber = parseInt(params.get('table'));

    const noTableError = document.getElementById('noTableError');
    const orderLayout = document.getElementById('orderLayout');
    const orderSuccess = document.getElementById('orderSuccess');
    const tableInfo = document.getElementById('tableInfo');
    const cartTableLabel = document.getElementById('cartTableLabel');
    const menuGrid = document.getElementById('orderMenuGrid');
    const categoryChips = document.getElementById('categoryChips');
    const cartItems = document.getElementById('cartItems');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartFooter = document.getElementById('cartFooter');
    const cartCount = document.getElementById('cartCount');
    const cartToggle = document.getElementById('cartToggle');
    const cartSidebar = document.getElementById('orderCart');
    const cartOverlay = document.getElementById('cartOverlay');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    const menuSearch = document.getElementById('menuSearch');
    const vegFilter = document.getElementById('vegFilter');

    let menuData = [];
    let cart = [];
    let activeCategory = 'all';

    // Check table number
    if (!tableNumber || tableNumber < 1 || tableNumber > 20) {
        noTableError.style.display = 'flex';
        return;
    }

    // Show order layout
    orderLayout.style.display = '';
    tableInfo.textContent = `Table #${tableNumber}`;
    cartTableLabel.textContent = `Table #${tableNumber}`;

    // Load menu
    try {
        const data = await api('/api/menu');
        menuData = data.categories;
        renderCategoryChips();
        renderOrderMenu();
    } catch (err) {
        menuGrid.innerHTML = '<p class="error-text">Failed to load menu. Please refresh.</p>';
    }

    // Cart toggle (mobile)
    if (cartToggle) {
        cartToggle.addEventListener('click', () => {
            cartSidebar.classList.toggle('open');
            cartOverlay.classList.toggle('active');
        });
    }
    if (cartOverlay) {
        cartOverlay.addEventListener('click', () => {
            cartSidebar.classList.remove('open');
            cartOverlay.classList.remove('active');
        });
    }

    // Search
    if (menuSearch) {
        menuSearch.addEventListener('input', () => renderOrderMenu());
    }

    // Veg filter
    if (vegFilter) {
        vegFilter.addEventListener('change', () => renderOrderMenu());
    }

    function renderCategoryChips() {
        let html = `<button class="chip active" data-slug="all">All</button>`;
        menuData.forEach(cat => {
            html += `<button class="chip" data-slug="${cat.slug}">${cat.icon || ''} ${cat.name}</button>`;
        });
        categoryChips.innerHTML = html;

        categoryChips.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                categoryChips.querySelector('.active').classList.remove('active');
                chip.classList.add('active');
                activeCategory = chip.dataset.slug;
                renderOrderMenu();
            });
        });
    }

    function renderOrderMenu() {
        const searchTerm = menuSearch?.value.toLowerCase() || '';
        const vegOnly = vegFilter?.checked || false;

        let html = '';
        const categories = activeCategory === 'all'
            ? menuData
            : menuData.filter(c => c.slug === activeCategory);

        categories.forEach(cat => {
            let items = cat.items.filter(i => {
                if (vegOnly && !i.is_veg) return false;
                if (searchTerm && !i.name.toLowerCase().includes(searchTerm) && !i.description?.toLowerCase().includes(searchTerm)) return false;
                return true;
            });

            if (items.length === 0) return;

            html += `<div class="order-category"><h3 class="order-cat-title">${cat.icon || ''} ${cat.name}</h3><div class="order-items">`;

            items.forEach(item => {
                const cartItem = cart.find(c => c.id === item.id);
                const qty = cartItem ? cartItem.quantity : 0;

                html += `
                    <div class="order-item-card" data-id="${item.id}">
                        <div class="order-item-left">
                            <div class="order-item-meta">
                                <span class="diet-badge ${item.is_veg ? 'veg' : 'nonveg'}"><span class="diet-dot"></span></span>
                                ${item.is_bestseller ? '<span class="bestseller-micro">★</span>' : ''}
                            </div>
                            <h4 class="order-item-name">${item.name}</h4>
                            <p class="order-item-desc">${item.description || ''}</p>
                            <span class="order-item-price">${formatPrice(item.price)}</span>
                        </div>
                        <div class="order-item-right">
                            <span class="order-item-emoji">${item.image_emoji || '🍽'}</span>
                            ${qty === 0
                                ? `<button class="add-btn" onclick="addToCart(${item.id})">ADD</button>`
                                : `<div class="qty-controls">
                                    <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
                                    <span class="qty-value">${qty}</span>
                                    <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
                                   </div>`
                            }
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
        });

        if (html === '') {
            html = '<p class="no-items-text">No items match your search.</p>';
        }

        menuGrid.innerHTML = html;
    }

    // Make cart functions global for onclick handlers
    window.addToCart = function (itemId) {
        const item = findMenuItem(itemId);
        if (!item) return;

        const existing = cart.find(c => c.id === itemId);
        if (existing) {
            existing.quantity++;
        } else {
            cart.push({ id: item.id, name: item.name, price: item.price, quantity: 1, emoji: item.image_emoji });
        }

        updateCartUI();
        renderOrderMenu();
        showToast(`${item.name} added to cart`, 'success', 2000);
    };

    window.updateQty = function (itemId, delta) {
        const cartItem = cart.find(c => c.id === itemId);
        if (!cartItem) return;

        cartItem.quantity += delta;
        if (cartItem.quantity <= 0) {
            cart = cart.filter(c => c.id !== itemId);
        }

        updateCartUI();
        renderOrderMenu();
    };

    window.removeFromCart = function (itemId) {
        cart = cart.filter(c => c.id !== itemId);
        updateCartUI();
        renderOrderMenu();
    };

    function findMenuItem(id) {
        for (const cat of menuData) {
            const item = cat.items.find(i => i.id === id);
            if (item) return item;
        }
        return null;
    }

    function updateCartUI() {
        const totalItems = cart.reduce((sum, c) => sum + c.quantity, 0);
        cartCount.textContent = totalItems;

        if (cart.length === 0) {
            cartEmpty.style.display = '';
            cartFooter.style.display = 'none';
            renderCartItems();
            return;
        }

        cartEmpty.style.display = 'none';
        cartFooter.style.display = '';

        renderCartItems();

        const subtotal = cart.reduce((sum, c) => sum + (c.price * c.quantity), 0);
        const gst = subtotal * 0.05;
        const total = subtotal + gst;

        document.getElementById('cartSubtotal').textContent = formatPrice(subtotal);
        document.getElementById('cartGST').textContent = formatPrice(gst);
        document.getElementById('cartTotal').textContent = formatPrice(total);
    }

    function renderCartItems() {
        if (cart.length === 0) {
            cartItems.innerHTML = `<div class="cart-empty" id="cartEmpty"><p>Your cart is empty</p><span>Add items from the menu</span></div>`;
            return;
        }

        let html = '';
        cart.forEach(item => {
            html += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <span class="cart-item-emoji">${item.emoji || '🍽'}</span>
                        <div>
                            <span class="cart-item-name">${item.name}</span>
                            <span class="cart-item-price">${formatPrice(item.price)} x ${item.quantity}</span>
                        </div>
                    </div>
                    <div class="cart-item-actions">
                        <span class="cart-item-subtotal">${formatPrice(item.price * item.quantity)}</span>
                        <button class="cart-remove-btn" onclick="removeFromCart(${item.id})" title="Remove">&times;</button>
                    </div>
                </div>
            `;
        });

        cartItems.innerHTML = html;
    }

    // Place order
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', async () => {
            if (cart.length === 0) {
                showToast('Add items to your cart first', 'error');
                return;
            }

            const customerName = document.getElementById('customerName')?.value.trim() || '';

            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<span class="spinner-sm"></span> Placing Order...';

            try {
                const orderData = {
                    table_number: tableNumber,
                    customer_name: customerName,
                    items: cart.map(c => ({
                        menu_item_id: c.id,
                        quantity: c.quantity
                    }))
                };

                const data = await api('/api/orders', {
                    method: 'POST',
                    body: JSON.stringify(orderData)
                });

                // Show success
                const order = data.order;
                let itemsHtml = order.items.map(i =>
                    `<div class="summary-item"><span>${i.name} x${i.quantity}</span><span>${formatPrice(i.subtotal)}</span></div>`
                ).join('');

                const subtotal = parseFloat(order.total);
                const gst = subtotal * 0.05;
                const grandTotal = subtotal + gst;

                document.getElementById('orderSummary').innerHTML = `
                    <div class="order-number">Order #${order.order_number}</div>
                    <div class="summary-items">${itemsHtml}</div>
                    <div class="summary-total">
                        <div class="summary-item"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
                        <div class="summary-item"><span>GST (5%)</span><span>${formatPrice(gst)}</span></div>
                        <div class="summary-item total"><span>Total</span><span>${formatPrice(grandTotal)}</span></div>
                    </div>
                    <p class="summary-note">Your order is being prepared. Sit back and relax!</p>
                `;

                orderLayout.style.display = 'none';
                orderSuccess.style.display = 'flex';
                cart = [];

            } catch (err) {
                showToast(err.message || 'Failed to place order', 'error');
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        });
    }

    // Initial cart render
    updateCartUI();
});
