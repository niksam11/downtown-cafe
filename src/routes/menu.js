const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/menu - All menu items grouped by category
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const categories = db.prepare(`
            SELECT * FROM categories ORDER BY sort_order
        `).all();

        const items = db.prepare(`
            SELECT mi.*, c.name as category_name, c.slug as category_slug
            FROM menu_items mi
            JOIN categories c ON mi.category_id = c.id
            WHERE mi.is_available = 1
            ORDER BY c.sort_order, mi.is_bestseller DESC, mi.name
        `).all();

        const grouped = categories.map(cat => ({
            ...cat,
            items: items.filter(item => item.category_id === cat.id)
        }));

        res.json({ categories: grouped });
    } catch (err) {
        console.error('Menu fetch error:', err);
        res.status(500).json({ error: 'Failed to load menu' });
    }
});

// GET /api/menu/:slug - Items by category slug
router.get('/:slug', (req, res) => {
    try {
        const db = getDB();
        const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const items = db.prepare(`
            SELECT * FROM menu_items WHERE category_id = ? AND is_available = 1
            ORDER BY is_bestseller DESC, name
        `).all(category.id);

        res.json({ category, items });
    } catch (err) {
        console.error('Category fetch error:', err);
        res.status(500).json({ error: 'Failed to load category' });
    }
});

module.exports = router;
