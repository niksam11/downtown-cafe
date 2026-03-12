require('dotenv').config();
const cluster = require('cluster');
const os = require('os');

const NUM_WORKERS = Math.min(os.cpus().length, 4);

if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
    console.log(`Primary ${process.pid} starting ${NUM_WORKERS} workers...`);
    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    const express = require('express');
    const compression = require('compression');
    const helmet = require('helmet');
    const cors = require('cors');
    const rateLimit = require('express-rate-limit');
    const path = require('path');
    const { initDB } = require('./src/database');

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Initialize database
    initDB();

    // Security & performance middleware
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    }));
    app.use(cors());
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Rate limiting
    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 100,
        message: { error: 'Too many requests, please try again later.' },
        skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
    });

    const bookingLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000, // Increased for concurrency testing / high load
        message: { error: 'Too many booking attempts. Please wait 15 minutes.' },
        skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
    });

    app.use('/api', apiLimiter);
    app.use('/api/reservations', bookingLimiter);

    // Static files with caching
    app.use(express.static(path.join(__dirname, 'public'), {
        maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
        etag: true
    }));

    // API Routes
    app.use('/api/menu', require('./src/routes/menu'));
    app.use('/api/tables', require('./src/routes/tables'));
    app.use('/api/reservations', require('./src/routes/reservations'));
    app.use('/api/orders', require('./src/routes/orders'));
    app.use('/api/admin', require('./src/routes/admin'));

    // Page routes - serve HTML files
    const pages = ['menu', 'reserve', 'order', 'about', 'contact'];
    pages.forEach(page => {
        app.get(`/${page}`, (req, res) => {
            res.sendFile(path.join(__dirname, 'public', `${page}.html`));
        });
    });

    // Admin routes
    app.get('/admin', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
    });

    // QR redirect: /scan/:tableNumber -> /order?table=N
    app.get('/scan/:tableNumber', (req, res) => {
        const tableNumber = parseInt(req.params.tableNumber);
        if (isNaN(tableNumber) || tableNumber < 1 || tableNumber > 20) {
            return res.status(404).send('Invalid table');
        }
        res.redirect(`/order?table=${tableNumber}`);
    });

    // Fallback
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Error handler
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ error: 'Something went wrong!' });
    });

    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} listening on port ${PORT}`);
        console.log(`Open http://localhost:${PORT}`);
    });
}
