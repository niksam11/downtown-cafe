const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || (
    process.env.RENDER ? path.join('/var/data', 'cafe.db') :
    process.env.VERCEL ? path.join('/tmp', 'cafe.db') :
    path.join(__dirname, '..', 'data', 'cafe.db')
);
let db;

function getDB() {
    if (!db) {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = -20000');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initDB() {
    const db = getDB();

    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            is_veg BOOLEAN DEFAULT 0,
            is_bestseller BOOLEAN DEFAULT 0,
            is_available BOOLEAN DEFAULT 1,
            image_emoji TEXT DEFAULT '🍽',
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number INTEGER UNIQUE NOT NULL,
            capacity INTEGER NOT NULL,
            status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','reserved')),
            qr_code_url TEXT
        );

        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            date TEXT NOT NULL,
            time_slot TEXT NOT NULL,
            table_id INTEGER NOT NULL,
            guests INTEGER NOT NULL,
            special_requests TEXT,
            status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed','no_show')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (table_id) REFERENCES tables(id)
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            table_id INTEGER NOT NULL,
            customer_name TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','preparing','ready','served','paid','cancelled')),
            total REAL DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (table_id) REFERENCES tables(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            menu_item_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            price REAL NOT NULL,
            subtotal REAL NOT NULL,
            notes TEXT,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        );

        CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date, time_slot);
        CREATE INDEX IF NOT EXISTS idx_reservations_table ON reservations(table_id, date);
        CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
        CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
        CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category_id);
    `);

    // Seed tables if empty
    const tableCount = db.prepare('SELECT COUNT(*) as count FROM tables').get();
    if (tableCount.count === 0) {
        seedTables(db);
    }

    const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
    if (catCount.count === 0) {
        seedMenu(db);
    }

    console.log('Database initialized successfully');
}

function seedTables(db) {
    const insert = db.prepare('INSERT INTO tables (table_number, capacity) VALUES (?, ?)');
    const tables = [
        // 2-seaters (tables 1-5)
        [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
        // 4-seaters (tables 6-12)
        [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
        // 6-seaters (tables 13-18)
        [13, 6], [14, 6], [15, 6], [16, 6], [17, 6], [18, 6],
        // 8-seaters (tables 19-20)
        [19, 8], [20, 8]
    ];
    const batch = db.transaction(() => {
        tables.forEach(([num, cap]) => insert.run(num, cap));
    });
    batch();
}

function seedMenu(db) {
    const insertCat = db.prepare('INSERT INTO categories (name, slug, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)');
    const insertItem = db.prepare('INSERT INTO menu_items (category_id, name, description, price, is_veg, is_bestseller, image_emoji) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const batch = db.transaction(() => {
        // Categories
        insertCat.run('Biryani', 'biryani', 'Aromatic rice dishes cooked to perfection', '🍚', 1);
        insertCat.run('Coffee & Hot Beverages', 'coffee', 'Handcrafted hot drinks', '☕', 2);
        insertCat.run('Cold Beverages', 'cold-beverages', 'Refreshing cold drinks & coolers', '🧋', 3);
        insertCat.run('Shakes & Smoothies', 'shakes', 'Thick indulgent shakes', '🥤', 4);
        insertCat.run('Starters & Snacks', 'starters', 'Crispy bites & appetizers', '🍗', 5);
        insertCat.run('Momos', 'momos', 'Steamed & fried dumplings', '🥟', 6);
        insertCat.run('Quick Bites', 'quick-bites', 'Sandwiches, burgers & more', '🍔', 7);
        insertCat.run('Desserts', 'desserts', 'Sweet endings', '🍰', 8);

        // Biryani (cat 1)
        insertItem.run(1, 'Veg Biryani', 'Fragrant basmati rice with mixed vegetables and aromatic spices', 180, 1, 0, '🍚');
        insertItem.run(1, 'Chicken Biryani', 'Tender chicken pieces layered with saffron-infused basmati rice', 250, 0, 1, '🍗');
        insertItem.run(1, 'Mutton Biryani', 'Slow-cooked mutton with rich spices and long-grain basmati', 320, 0, 0, '🍖');
        insertItem.run(1, 'Egg Biryani', 'Perfectly boiled eggs in flavorful spiced rice', 200, 0, 0, '🥚');
        insertItem.run(1, 'Paneer Biryani', 'Soft paneer cubes with fragrant rice and mint', 220, 1, 0, '🧀');
        insertItem.run(1, 'Special Downtown Biryani', 'Our signature biryani with secret spice blend and extra loaded', 300, 0, 1, '⭐');

        // Coffee & Hot (cat 2)
        insertItem.run(2, 'Cappuccino', 'Perfectly brewed espresso with velvety steamed milk and foam', 120, 1, 1, '☕');
        insertItem.run(2, 'Café Latte', 'Smooth espresso with creamy steamed milk', 140, 1, 0, '☕');
        insertItem.run(2, 'Espresso', 'Strong, concentrated shot of pure coffee', 100, 1, 0, '☕');
        insertItem.run(2, 'Americano', 'Espresso diluted with hot water for a smooth finish', 110, 1, 0, '☕');
        insertItem.run(2, 'Hot Chocolate', 'Rich Belgian chocolate melted into steamed milk', 150, 1, 0, '🍫');
        insertItem.run(2, 'Masala Chai', 'Traditional Indian spiced tea brewed to perfection', 60, 1, 0, '🍵');
        insertItem.run(2, 'Green Tea', 'Light and refreshing antioxidant-rich green tea', 80, 1, 0, '🍵');

        // Cold Beverages (cat 3)
        insertItem.run(3, 'Cold Coffee with Ice Cream', 'Rich creamy cold coffee topped with vanilla ice cream', 160, 1, 1, '🧋');
        insertItem.run(3, 'Iced Latte', 'Chilled espresso with cold milk over ice', 150, 1, 0, '🧊');
        insertItem.run(3, 'Virgin Mojito', 'Refreshing mint-infused cooler with zesty citrus twist', 140, 1, 1, '🍹');
        insertItem.run(3, 'Blue Lagoon', 'Vibrant blue curacao cooler with citrus and soda', 150, 1, 0, '💙');
        insertItem.run(3, 'Lemon Iced Tea', 'Freshly brewed tea chilled with lemon and mint', 120, 1, 0, '🍋');
        insertItem.run(3, 'Watermelon Cooler', 'Fresh watermelon juice blended with mint', 130, 1, 0, '🍉');
        insertItem.run(3, 'Peach Iced Tea', 'Chilled tea infused with sweet peach flavor', 130, 1, 0, '🍑');

        // Shakes (cat 4)
        insertItem.run(4, 'Chocolate Shake', 'Thick and creamy chocolate milkshake', 160, 1, 0, '🍫');
        insertItem.run(4, 'Oreo Shake', 'Crushed Oreo cookies blended into creamy shake', 180, 1, 1, '🖤');
        insertItem.run(4, 'Strawberry Shake', 'Fresh strawberry blended with milk and ice cream', 160, 1, 0, '🍓');
        insertItem.run(4, 'Mango Shake', 'Seasonal mango pulp shake with cream', 150, 1, 0, '🥭');
        insertItem.run(4, 'Butterscotch Shake', 'Caramel butterscotch blended into thick milkshake', 160, 1, 0, '🍯');
        insertItem.run(4, 'KitKat Shake', 'KitKat chunks blended into chocolate milkshake', 190, 1, 0, '🍫');

        // Starters (cat 5)
        insertItem.run(5, 'Chicken Wings (6pc)', 'Crispy golden wings tossed in signature sauce', 220, 0, 1, '🍗');
        insertItem.run(5, 'Chicken Lollipop', 'Succulent drumettes marinated and fried golden', 240, 0, 1, '🍢');
        insertItem.run(5, 'Paneer Tikka', 'Chargrilled cottage cheese with bell peppers', 200, 1, 0, '🧀');
        insertItem.run(5, 'French Fries', 'Classic crispy golden fries with seasoning', 120, 1, 0, '🍟');
        insertItem.run(5, 'Loaded Nachos', 'Tortilla chips loaded with cheese, salsa and jalapeños', 180, 1, 0, '🌮');
        insertItem.run(5, 'Garlic Bread', 'Toasted bread with garlic butter and herbs', 140, 1, 0, '🍞');
        insertItem.run(5, 'Fish Fingers', 'Crispy breaded fish strips with tartar sauce', 250, 0, 0, '🐟');
        insertItem.run(5, 'Mushroom Chilli', 'Spicy stir-fried mushroom with peppers', 190, 1, 0, '🍄');

        // Momos (cat 6)
        insertItem.run(6, 'Steamed Veg Momos', 'Soft steamed dumplings with mixed veg filling', 120, 1, 0, '🥟');
        insertItem.run(6, 'Steamed Chicken Momos', 'Juicy chicken-filled steamed dumplings', 150, 0, 1, '🥟');
        insertItem.run(6, 'Fried Veg Momos', 'Crispy fried dumplings with veg stuffing', 140, 1, 0, '🥟');
        insertItem.run(6, 'Fried Chicken Momos', 'Golden fried chicken dumplings', 170, 0, 0, '🥟');
        insertItem.run(6, 'Tandoori Momos', 'Chargrilled momos with smoky tandoori flavor', 180, 0, 1, '🔥');
        insertItem.run(6, 'Kurkure Momos', 'Extra crispy coated momos with spicy chutney', 170, 0, 0, '✨');
        insertItem.run(6, 'Afghani Momos', 'Creamy Afghani sauce topped momos', 190, 0, 0, '🥟');

        // Quick Bites (cat 7)
        insertItem.run(7, 'Veg Sandwich', 'Fresh veggies layered with cheese in toasted bread', 100, 1, 0, '🥪');
        insertItem.run(7, 'Chicken Sandwich', 'Grilled chicken with lettuce and mayo', 140, 0, 0, '🥪');
        insertItem.run(7, 'Veg Burger', 'Crispy veg patty with fresh toppings', 120, 1, 0, '🍔');
        insertItem.run(7, 'Chicken Burger', 'Juicy chicken patty with cheese and sauce', 160, 0, 0, '🍔');
        insertItem.run(7, 'Pasta Red Sauce', 'Penne in tangy tomato basil sauce', 180, 1, 0, '🍝');
        insertItem.run(7, 'Pasta White Sauce', 'Creamy alfredo pasta with herbs', 190, 1, 0, '🍝');
        insertItem.run(7, 'Maggi', 'Classic Maggi noodles tossed with veggies', 80, 1, 0, '🍜');
        insertItem.run(7, 'Cheese Maggi', 'Maggi loaded with extra cheese', 110, 1, 0, '🧀');

        // Desserts (cat 8)
        insertItem.run(8, 'Chocolate Brownie', 'Warm fudgy brownie with vanilla ice cream', 160, 1, 0, '🍫');
        insertItem.run(8, 'Gulab Jamun', 'Soft milk dumplings soaked in sugar syrup (2pc)', 80, 1, 0, '🟤');
        insertItem.run(8, 'Ice Cream Sundae', 'Three scoops with chocolate sauce and nuts', 150, 1, 0, '🍨');
        insertItem.run(8, 'Chocolate Lava Cake', 'Molten chocolate cake with ice cream', 200, 1, 1, '🎂');
    });
    batch();
}

module.exports = { getDB, initDB };
