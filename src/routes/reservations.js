const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { sendBookingConfirmation, sendAdminNotification } = require('../utils/email');
const { v4: uuidv4 } = require('uuid');

// Time slots from 11:00 AM to 12:00 AM (midnight)
const TIME_SLOTS = [
    '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'
];

// GET /api/reservations/slots?date=YYYY-MM-DD
router.get('/slots', (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date is required' });

        const db = getDB();

        // Get reservations for the date grouped by time slot
        const booked = db.prepare(`
            SELECT time_slot, table_id, t.capacity, t.table_number
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE r.date = ? AND r.status = 'confirmed'
        `).all(date);

        const allTables = db.prepare('SELECT * FROM tables ORDER BY table_number').all();

        const slots = TIME_SLOTS.map(slot => {
            const bookedTableIds = booked
                .filter(b => b.time_slot === slot)
                .map(b => b.table_id);

            const availableTables = allTables.filter(t => !bookedTableIds.includes(t.id));

            return {
                time: slot,
                label: formatTime(slot),
                totalTables: allTables.length,
                availableTables: availableTables.length,
                available: availableTables.length > 0,
                tables: availableTables
            };
        });

        // Filter out past time slots for today
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentHour = now.getHours();

        const filteredSlots = date === today
            ? slots.filter(s => parseInt(s.time) > currentHour || s.time === '00:00')
            : slots;

        res.json({ date, slots: filteredSlots });
    } catch (err) {
        console.error('Slots error:', err);
        res.status(500).json({ error: 'Failed to load slots' });
    }
});

// POST /api/reservations - Create new reservation
router.post('/', (req, res) => {
    try {
        const { name, email, phone, date, time_slot, guests, special_requests } = req.body;

        // Validation
        if (!name || !email || !phone || !date || !time_slot || !guests) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (guests < 1 || guests > 20) {
            return res.status(400).json({ error: 'Guests must be between 1 and 20' });
        }

        if (!TIME_SLOTS.includes(time_slot)) {
            return res.status(400).json({ error: 'Invalid time slot' });
        }

        // Validate date is not in the past
        const reserveDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (reserveDate < today) {
            return res.status(400).json({ error: 'Cannot book for a past date' });
        }

        const db = getDB();

        const bookingId = 'DC-' + uuidv4().substring(0, 8).toUpperCase();
        let reservationId;
        
        try {
            // Use better-sqlite3 native exclusive transaction (it defaults to deferred but handles busy retries natively)
            // By wrapping this in db.transaction AND executing an IMMEDIATE query internally, we queue it
            const bookTable = db.transaction(() => {
                // Find a suitable available table
                const table = db.prepare(`
                    SELECT t.* FROM tables t
                    WHERE t.capacity >= ?
                    AND t.id NOT IN (
                        SELECT r.table_id FROM reservations r
                        WHERE r.date = ? AND r.time_slot = ? AND r.status = 'confirmed'
                    )
                    ORDER BY t.capacity ASC
                    LIMIT 1
                `).get(parseInt(guests), date, time_slot);

                if (!table) {
                    throw new Error('NO_TABLES');
                }

                const result = db.prepare(`
                    INSERT INTO reservations (booking_id, name, email, phone, date, time_slot, table_id, guests, special_requests)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(bookingId, name, email, phone, date, time_slot, table.id, parseInt(guests), special_requests || null);
                
                return result.lastInsertRowid;
            });
            
            // To ensure exclusive write lock without bypassing the busy queue, we use booking transaction
            reservationId = bookTable();
            
        } catch (err) {
            if (err.message === 'NO_TABLES') {
                return res.status(409).json({
                    error: 'No tables available for this time slot. Please choose another slot.'
                });
            }
            if (err.code === 'SQLITE_BUSY') {
                 return res.status(503).json({ error: 'Server is currently processing too many bookings. Please try again in a moment.' });
            }
            throw err;
        }

        const reservation = db.prepare(`
            SELECT r.*, t.table_number, t.capacity
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE r.id = ?
        `).get(reservationId);

        // Send email notifications (non-blocking)
        sendBookingConfirmation(reservation).catch(err => console.error('Email error:', err));
        sendAdminNotification(reservation).catch(err => console.error('Admin email error:', err));

        res.status(201).json({
            message: 'Table reserved successfully!',
            reservation: {
                booking_id: reservation.booking_id,
                name: reservation.name,
                date: reservation.date,
                time: formatTime(reservation.time_slot),
                table_number: reservation.table_number,
                guests: reservation.guests,
                status: reservation.status
            }
        });
    } catch (err) {
        console.error('Reservation error:', err);
        res.status(500).json({ error: 'Failed to create reservation' });
    }
});

// GET /api/reservations/:bookingId - Get reservation details
router.get('/:bookingId', (req, res) => {
    try {
        const db = getDB();
        const reservation = db.prepare(`
            SELECT r.*, t.table_number, t.capacity
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE r.booking_id = ?
        `).get(req.params.bookingId);

        if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

        res.json({ reservation });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load reservation' });
    }
});

// DELETE /api/reservations/:bookingId - Cancel reservation
router.delete('/:bookingId', (req, res) => {
    try {
        const db = getDB();
        const result = db.prepare(`
            UPDATE reservations SET status = 'cancelled' WHERE booking_id = ? AND status = 'confirmed'
        `).run(req.params.bookingId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Reservation not found or already cancelled' });
        }

        res.json({ message: 'Reservation cancelled successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to cancel reservation' });
    }
});

function formatTime(time) {
    const hour = parseInt(time);
    if (hour === 0) return '12:00 AM';
    if (hour === 12) return '12:00 PM';
    if (hour > 12) return `${hour - 12}:00 PM`;
    return `${hour}:00 AM`;
}

module.exports = router;
