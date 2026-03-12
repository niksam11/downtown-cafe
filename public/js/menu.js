// ===== MENU PAGE JS =====
document.addEventListener('DOMContentLoaded', async () => {
    const menuGrid = document.getElementById('menu-grid');
    const categoryTabs = document.getElementById('categoryTabs');
    const vegToggle = document.getElementById('vegToggle');
    const nonvegToggle = document.getElementById('nonvegToggle');
    const allToggle = document.getElementById('allToggle');

    let menuData = [];
    let activeCategory = 'all';
    let dietFilter = 'all'; // all, veg, nonveg

    const menuLoading = document.getElementById('menu-loading');

    // Load menu
    try {
        const data = await api('/api/menu');
        menuData = data.categories;
        if (menuLoading) menuLoading.style.display = 'none';
        renderCategoryTabs();
        renderMenu();
    } catch (err) {
        if (menuLoading) menuLoading.style.display = 'none';
        menuGrid.innerHTML = '<p class="error-text">Failed to load menu. Please try again.</p>';
        console.error(err);
    }

    function renderCategoryTabs() {
        if (!categoryTabs) return;
        let html = `<button class="category-tab active" data-slug="all">All</button>`;
        menuData.forEach(cat => {
            html += `<button class="category-tab" data-slug="${cat.slug}">${cat.icon || ''} ${cat.name}</button>`;
        });
        categoryTabs.innerHTML = html;

        categoryTabs.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.querySelector('.active').classList.remove('active');
                tab.classList.add('active');
                activeCategory = tab.dataset.slug;
                renderMenu();
            });
        });
    }

    function renderMenu() {
        if (!menuGrid) return;

        let html = '';
        const categories = activeCategory === 'all'
            ? menuData
            : menuData.filter(c => c.slug === activeCategory);

        categories.forEach(cat => {
            let items = cat.items;

            // Apply diet filter
            if (dietFilter === 'veg') items = items.filter(i => i.is_veg);
            else if (dietFilter === 'nonveg') items = items.filter(i => !i.is_veg);

            if (items.length === 0) return;

            html += `
                <div class="menu-category-section">
                    <div class="menu-category-header">
                        <span class="cat-icon">${cat.icon || ''}</span>
                        <div>
                            <h3>${cat.name}</h3>
                            <p>${cat.description || ''}</p>
                        </div>
                    </div>
                    <div class="menu-items-grid">
            `;

            items.forEach(item => {
                html += `
                    <div class="menu-item-card animate-on-scroll">
                        <div class="menu-item-top">
                            <span class="menu-item-emoji">${item.image_emoji || '🍽'}</span>
                            <div class="menu-item-badges">
                                <span class="diet-badge ${item.is_veg ? 'veg' : 'nonveg'}">
                                    <span class="diet-dot"></span>
                                </span>
                                ${item.is_bestseller ? '<span class="bestseller-tag">★ Bestseller</span>' : ''}
                            </div>
                        </div>
                        <div class="menu-item-info">
                            <h4>${item.name}</h4>
                            <p>${item.description || ''}</p>
                            <div class="menu-item-bottom">
                                <span class="menu-item-price">${formatPrice(item.price)}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
        });

        if (html === '') {
            html = '<p class="no-items-text">No items found for the selected filter.</p>';
        }

        menuGrid.innerHTML = html;

        // Re-init scroll animations
        menuGrid.querySelectorAll('.animate-on-scroll').forEach((el, i) => {
            el.dataset.delay = Math.min(i * 50, 400);
            const obs = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setTimeout(() => entry.target.classList.add('visible'), parseInt(entry.target.dataset.delay));
                        obs.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            obs.observe(el);
        });
    }

    // Diet filter toggles
    [allToggle, vegToggle, nonvegToggle].forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            document.querySelector('.diet-toggle.active')?.classList.remove('active');
            btn.classList.add('active');
            dietFilter = btn.dataset.diet;
            renderMenu();
        });
    });
});
