const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');

// POST /api/orders - Create new order from table
router.post('/', (req, res) => {
    try {
        const { table_number, customer_name, items } = req.body;

        if (!table_number || !items || !items.length) {
            return res.status(400).json({ error: 'table_number and items are required' });
        }

        const db = getDB();

        const table = db.prepare('SELECT * FROM tables WHERE table_number = ?').get(table_number);
        if (!table) return res.status(404).json({ error: 'Table not found' });

        const orderNumber = 'ORD-' + uuidv4().substring(0, 8).toUpperCase();

        // Calculate total and validate items
        let total = 0;
        const validatedItems = [];

        for (const item of items) {
            const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1').get(item.menu_item_id);
            if (!menuItem) {
                return res.status(400).json({ error: `Menu item ${item.menu_item_id} not found or unavailable` });
            }
            const qty = parseInt(item.quantity) || 1;
            const subtotal = menuItem.price * qty;
            total += subtotal;
            validatedItems.push({
                menu_item_id: menuItem.id,
                quantity: qty,
                price: menuItem.price,
                subtotal,
                notes: item.notes || null,
                name: menuItem.name
            });
        }

        // Insert order and items in transaction
        const createOrder = db.transaction(() => {
            const orderResult = db.prepare(`
                INSERT INTO orders (order_number, table_id, customer_name, total)
                VALUES (?, ?, ?, ?)
            `).run(orderNumber, table.id, customer_name || null, total);

            const insertItem = db.prepare(`
                INSERT INTO order_items (order_id, menu_item_id, quantity, price, subtotal, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const vi of validatedItems) {
                insertItem.run(orderResult.lastInsertRowid, vi.menu_item_id, vi.quantity, vi.price, vi.subtotal, vi.notes);
            }

            // Mark table as occupied
            db.prepare('UPDATE tables SET status = ? WHERE id = ?').run('occupied', table.id);

            return orderResult.lastInsertRowid;
        });

        const orderId = createOrder();

        res.status(201).json({
            message: 'Order placed successfully!',
            order: {
                order_number: orderNumber,
                table_number,
                items: validatedItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, subtotal: i.subtotal })),
                total: total.toFixed(2),
                status: 'pending'
            }
        });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

// GET /api/orders/:orderNumber - Get order details
router.get('/:orderNumber', (req, res) => {
    try {
        const db = getDB();
        const order = db.prepare(`
            SELECT o.*, t.table_number
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            WHERE o.order_number = ?
        `).get(req.params.orderNumber);

        if (!order) return res.status(404).json({ error: 'Order not found' });

        const items = db.prepare(`
            SELECT oi.*, mi.name, mi.image_emoji, mi.is_veg
            FROM order_items oi
            JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE oi.order_id = ?
        `).all(order.id);

        res.json({ order: { ...order, items } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load order' });
    }
});

// GET /api/orders/table/:tableNumber - Get active orders for a table
router.get('/table/:tableNumber', (req, res) => {
    try {
        const db = getDB();
        const table = db.prepare('SELECT * FROM tables WHERE table_number = ?').get(req.params.tableNumber);
        if (!table) return res.status(404).json({ error: 'Table not found' });

        const orders = db.prepare(`
            SELECT * FROM orders
            WHERE table_id = ? AND status NOT IN ('paid', 'cancelled')
            ORDER BY created_at DESC
        `).all(table.id);

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

        res.json({ table, orders: ordersWithItems });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load orders' });
    }
});

// POST /api/orders/:orderNumber/items - Add items to existing order
router.post('/:orderNumber/items', (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !items.length) {
            return res.status(400).json({ error: 'items are required' });
        }

        const db = getDB();
        const order = db.prepare(`
            SELECT * FROM orders WHERE order_number = ? AND status NOT IN ('paid', 'cancelled')
        `).get(req.params.orderNumber);

        if (!order) return res.status(404).json({ error: 'Active order not found' });

        let addedTotal = 0;
        const addItems = db.transaction(() => {
            const insertItem = db.prepare(`
                INSERT INTO order_items (order_id, menu_item_id, quantity, price, subtotal, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const item of items) {
                const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1').get(item.menu_item_id);
                if (!menuItem) continue;
                const qty = parseInt(item.quantity) || 1;
                const subtotal = menuItem.price * qty;
                addedTotal += subtotal;
                insertItem.run(order.id, menuItem.id, qty, menuItem.price, subtotal, item.notes || null);
            }

            // Update total
            db.prepare('UPDATE orders SET total = total + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(addedTotal, order.id);
        });

        addItems();

        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);

        res.json({
            message: 'Items added to order',
            total: updatedOrder.total.toFixed(2)
        });
    } catch (err) {
        console.error('Add items error:', err);
        res.status(500).json({ error: 'Failed to add items' });
    }
});

module.exports = router;
