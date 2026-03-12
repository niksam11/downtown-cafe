const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/tables - Get all tables with current status
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const tables = db.prepare('SELECT * FROM tables ORDER BY table_number').all();
        res.json({ tables });
    } catch (err) {
        console.error('Tables fetch error:', err);
        res.status(500).json({ error: 'Failed to load tables' });
    }
});

// GET /api/tables/available?date=YYYY-MM-DD&time=HH:MM&guests=N
router.get('/available', (req, res) => {
    try {
        const { date, time, guests } = req.query;
        if (!date || !time || !guests) {
            return res.status(400).json({ error: 'date, time, and guests are required' });
        }

        const guestCount = parseInt(guests);
        const db = getDB();

        // Get tables that can fit the party and aren't reserved for that slot
        const tables = db.prepare(`
            SELECT t.* FROM tables t
            WHERE t.capacity >= ?
            AND t.id NOT IN (
                SELECT r.table_id FROM reservations r
                WHERE r.date = ? AND r.time_slot = ? AND r.status = 'confirmed'
            )
            ORDER BY t.capacity ASC, t.table_number ASC
        `).all(guestCount, date, time);

        res.json({ tables });
    } catch (err) {
        console.error('Available tables error:', err);
        res.status(500).json({ error: 'Failed to check availability' });
    }
});

// GET /api/tables/:number - Get table by number
router.get('/:number', (req, res) => {
    try {
        const db = getDB();
        const table = db.prepare('SELECT * FROM tables WHERE table_number = ?').get(req.params.number);
        if (!table) return res.status(404).json({ error: 'Table not found' });
        res.json({ table });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load table' });
    }
});

module.exports = router;
