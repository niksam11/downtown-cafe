const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const QRCode = require('qrcode');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'downtown@admin2024';

// Simple auth middleware
function authMiddleware(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// POST /api/admin/login
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: ADMIN_PASSWORD });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// GET /api/admin/dashboard - Stats
router.get('/dashboard', authMiddleware, (req, res) => {
    try {
        const db = getDB();
        const today = new Date().toISOString().split('T')[0];

        const stats = {
            todayReservations: db.prepare(
                `SELECT COUNT(*) as count FROM reservations WHERE date = ? AND status = 'confirmed'`
            ).get(today).count,

            todayOrders: db.prepare(
                `SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?`
            ).get(today).count,

            todayRevenue: db.prepare(
                `SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE DATE(created_at) = ? AND status NOT IN ('cancelled')`
            ).get(today).total,

            activeOrders: db.prepare(
                `SELECT COUNT(*) as count FROM orders WHERE status NOT IN ('paid', 'cancelled')`
            ).get().count,

            totalReservations: db.prepare(
                `SELECT COUNT(*) as count FROM reservations WHERE status = 'confirmed'`
            ).get().count,

            occupiedTables: db.prepare(
                `SELECT COUNT(*) as count FROM tables WHERE status = 'occupied'`
            ).get().count,

            totalTables: db.prepare(`SELECT COUNT(*) as count FROM tables`).get().count
        };

        res.json(stats);
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// GET /api/admin/reservations - All reservations
router.get('/reservations', authMiddleware, (req, res) => {
    try {
        const db = getDB();
        const { date, status } = req.query;

        let query = `
            SELECT r.*, t.table_number, t.capacity
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE 1=1
        `;
        const params = [];

        if (date) { query += ' AND r.date = ?'; params.push(date); }
        if (status) { query += ' AND r.status = ?'; params.push(status); }

        query += ' ORDER BY r.date DESC, r.time_slot ASC';

        const reservations = db.prepare(query).all(...params);
        res.json({ reservations });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load reservations' });
    }
});

// PUT /api/admin/reservations/:id/status - Update reservation status
router.put('/reservations/:id/status', authMiddleware, (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['confirmed', 'cancelled', 'completed', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const db = getDB();
        db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ message: 'Reservation updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update reservation' });
    }
});

// GET /api/admin/orders - All orders
router.get('/orders', authMiddleware, (req, res) => {
    try {
        const db = getDB();
        const { status, date } = req.query;

        let query = `
            SELECT o.*, t.table_number
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            WHERE 1=1
        `;
        const params = [];

        if (status) { query += ' AND o.status = ?'; params.push(status); }
        if (date) { query += ' AND DATE(o.created_at) = ?'; params.push(date); }

        query += ' ORDER BY o.created_at DESC';

        const orders = db.prepare(query).all(...params);

        // Get items for each order
        const ordersWithItems = orders.map(order => {
            const items = db.prepare(`
                SELECT oi.*, mi.name, mi.image_emoji, mi.is_veg
                FROM order_items oi
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE oi.order_id = ?
            `).all(order.id);
            return { ...order, items };
        });

        res.json({ orders: ordersWithItems });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load orders' });
    }
});

// PUT /api/admin/orders/:id/status - Update order status
router.put('/orders/:id/status', authMiddleware, (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const db = getDB();
        db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, req.params.id);

        // If paid or cancelled, free the table
        if (status === 'paid' || status === 'cancelled') {
            const order = db.prepare('SELECT table_id FROM orders WHERE id = ?').get(req.params.id);
            if (order) {
                const activeOrders = db.prepare(
                    `SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND status NOT IN ('paid', 'cancelled') AND id != ?`
                ).get(order.table_id, req.params.id);

                if (activeOrders.count === 0) {
                    db.prepare('UPDATE tables SET status = ? WHERE id = ?').run('available', order.table_id);
                }
            }
        }

        res.json({ message: 'Order status updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// GET /api/admin/qr/:tableNumber - Generate QR code
router.get('/qr/:tableNumber', authMiddleware, async (req, res) => {
    try {
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const url = `${baseUrl}/scan/${req.params.tableNumber}`;

        const qrDataUrl = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            color: { dark: '#2B1D16', light: '#FFF9F2' }
        });

        res.json({
            table_number: parseInt(req.params.tableNumber),
            url,
            qr_code: qrDataUrl
        });
    } catch (err) {
        console.error('QR generation error:', err);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// GET /api/admin/qr-all - Generate QR codes for all tables
router.get('/qr-all', authMiddleware, async (req, res) => {
    try {
        const db = getDB();
        const tables = db.prepare('SELECT * FROM tables ORDER BY table_number').all();
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

        const qrCodes = await Promise.all(tables.map(async (table) => {
            const url = `${baseUrl}/scan/${table.table_number}`;
            const qrDataUrl = await QRCode.toDataURL(url, {
                width: 400,
                margin: 2,
                color: { dark: '#2B1D16', light: '#FFF9F2' }
            });
            return { table_number: table.table_number, capacity: table.capacity, url, qr_code: qrDataUrl };
        }));

        res.json({ qr_codes: qrCodes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR codes' });
    }
});

// PUT /api/admin/menu/:id - Toggle menu item availability
router.put('/menu/:id', authMiddleware, (req, res) => {
    try {
        const { is_available } = req.body;
        const db = getDB();
        db.prepare('UPDATE menu_items SET is_available = ? WHERE id = ?')
            .run(is_available ? 1 : 0, req.params.id);
        res.json({ message: 'Menu item updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});

module.exports = router;
