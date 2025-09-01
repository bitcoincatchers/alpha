/**
 * 🧪 TEST DATA SEEDER
 * Creates sample data for development and testing
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use test database
const dbPath = process.env.NODE_ENV === 'development' 
    ? path.join(__dirname, '../test_alphabot_signals.db')
    : path.join(__dirname, '../alphabot_signals.db');

console.log(`📊 Seeding test data to: ${dbPath}`);

const db = new sqlite3.Database(dbPath);

// Sample test data
const testSignals = [
    {
        symbol: 'BONK',
        contract: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        action: 'BUY',
        mcap_target: 50000000,
        current_mcap: 45000000,
        user_id: 'testuser',
        chat_id: -1001234567890,
        status: 'active'
    },
    {
        symbol: 'PEPE',
        contract: '5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC',
        action: 'BUY', 
        mcap_target: 25000000,
        current_mcap: 30000000,
        user_id: 'testuser',
        chat_id: -1001234567890,
        status: 'filled'
    },
    {
        symbol: 'DOGE',
        contract: '3nkKg94fYJi5g6D3thxKCxhbtehUJVEBwwyYKz4Z3Ukh',
        action: 'BUY',
        mcap_target: 100000000,
        current_mcap: 95000000,
        user_id: 'testuser',
        chat_id: -1001234567890,
        status: 'pending'
    }
];

const testOrders = [
    {
        user_id: 'testuser',
        token_symbol: 'BONK',
        token_contract: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        sol_amount: 0.1,
        target_mcap: 50000000,
        entry_mcap: 45000000,
        status: 'filled',
        tx_hash: '5j7K8L9M0nOpQrStUvWxYz1A2b3C4d5E6f7G8h9I0j1K2l3M4n5O6p7Q8r9S0t1U2v3W4x5Y6z7A8b9C0d1E2f3G'
    },
    {
        user_id: 'testuser', 
        token_symbol: 'PEPE',
        token_contract: '5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC',
        sol_amount: 0.05,
        target_mcap: 25000000,
        entry_mcap: 24000000,
        status: 'filled',
        tx_hash: '9h8I7j6K5l4M3n2O1p0Q9r8S7t6U5v4W3x2Y1z0A9b8C7d6E5f4G3h2I1j0K9l8M7n6O5p4Q3r2S1t0U9v8W7x6Y'
    }
];

async function seedDatabase() {
    return new Promise((resolve, reject) => {
        // Create tables if they don't exist
        db.serialize(() => {
            // Signals table
            db.run(`
                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    contract TEXT NOT NULL,
                    action TEXT NOT NULL,
                    mcap_target INTEGER,
                    current_mcap INTEGER,
                    user_id TEXT,
                    chat_id INTEGER,
                    status TEXT DEFAULT 'active',
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    bot_session INTEGER
                )
            `);

            // Limit orders table  
            db.run(`
                CREATE TABLE IF NOT EXISTS limit_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    token_symbol TEXT NOT NULL,
                    token_contract TEXT NOT NULL,
                    sol_amount REAL NOT NULL,
                    target_mcap INTEGER NOT NULL,
                    entry_mcap INTEGER,
                    status TEXT DEFAULT 'pending',
                    tx_hash TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    filled_at DATETIME
                )
            `);

            // Clear existing test data
            db.run("DELETE FROM signals WHERE user_id = 'testuser'");
            db.run("DELETE FROM limit_orders WHERE user_id = 'testuser'");

            // Insert test signals
            const signalStmt = db.prepare(`
                INSERT INTO signals (symbol, contract, action, mcap_target, current_mcap, user_id, chat_id, status, bot_session)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 99)
            `);

            testSignals.forEach(signal => {
                signalStmt.run(
                    signal.symbol,
                    signal.contract, 
                    signal.action,
                    signal.mcap_target,
                    signal.current_mcap,
                    signal.user_id,
                    signal.chat_id,
                    signal.status
                );
            });
            signalStmt.finalize();

            // Insert test orders
            const orderStmt = db.prepare(`
                INSERT INTO limit_orders (user_id, token_symbol, token_contract, sol_amount, target_mcap, entry_mcap, status, tx_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            testOrders.forEach(order => {
                orderStmt.run(
                    order.user_id,
                    order.token_symbol,
                    order.token_contract,
                    order.sol_amount,
                    order.target_mcap,
                    order.entry_mcap,
                    order.status,
                    order.tx_hash
                );
            });
            orderStmt.finalize();

            console.log('✅ Test data seeded successfully!');
            console.log(`📊 Added ${testSignals.length} test signals`);
            console.log(`💰 Added ${testOrders.length} test orders`);
            console.log('');
            console.log('🧪 Test endpoints:');
            console.log('   - GET /api/positions/filter-test/testuser');
            console.log('   - GET /api/debug/position/BONK'); 
            console.log('   - GET /api/health');
            
            resolve();
        });
    });
}

// Run if called directly
if (require.main === module) {
    seedDatabase()
        .then(() => {
            db.close();
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Error seeding database:', err);
            process.exit(1);
        });
}

module.exports = { seedDatabase };