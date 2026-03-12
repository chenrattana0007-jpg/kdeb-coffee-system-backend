const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

// --- NEW: THE DEBUG BLOCK ---
console.log("=== DEBUG INFO ===");
console.log("Is the URL loaded?:", process.env.DATABASE_URL ? "YES" : "NO (It is undefined!)");
if (process.env.DATABASE_URL) {
    console.log("The link starts with:", process.env.DATABASE_URL.substring(0, 40) + "...");
}
console.log("==================");
// ----------------------------

const app = express();
app.use(cors());
app.use(express.json());

// 1. Simple Test Route
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, message: "Cloud Database connected!", time: result.rows[0].now });
    } catch (err) {
        console.error("Test Route Error:", err.message);
        res.status(500).json({ success: false, error: "Database connection failed" });
    }
});

// 2. The Menu Route (DEBUG MODE ENABLED)
app.get('/api/menu', async (req, res) => {
    try {
        const products = await pool.query('SELECT * FROM products WHERE is_active = TRUE');
        res.json({ success: true, count: products.rowCount, data: products.rows });
    } catch (err) {
        console.error("Menu Route Error:", err.message);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            hint: "Paste this exact error message back to me!" 
        });
    }
});

// 3. Modifiers Route
app.get('/api/modifiers/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const query = `
            SELECT 
                mg.id AS group_id, mg.name_en AS group_en, mg.name_km AS group_km, mg.is_required, mg.max_selections,
                m.id AS mod_id, m.name_en AS mod_en, m.name_km AS mod_km, m.price_adjustment
            FROM product_modifier_groups pmg
            JOIN modifier_groups mg ON pmg.group_id = mg.id
            JOIN modifiers m ON m.group_id = mg.id
            WHERE pmg.product_id = $1;
        `;
        const result = await pool.query(query, [productId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Modifier Error:", err.message);
        res.status(500).json({ success: false, error: "Failed to fetch modifiers" });
    }
});

// 4. Checkout Transaction Route WITH Live Inventory Deduction
app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); 
        const { cart, totalAmount, paymentMethod } = req.body;

        const orderResult = await client.query(
            `INSERT INTO orders (total_amount, payment_method) VALUES ($1, $2) RETURNING id`,
            [totalAmount, paymentMethod || 'Cash']
        );
        const orderId = orderResult.rows[0].id;

        for (let item of cart) {
            const itemResult = await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, base_price_at_sale, subtotal)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [orderId, item.id, 1, item.base_price, item.finalPrice]
            );
            const orderItemId = itemResult.rows[0].id;

            await client.query(`
                UPDATE inventory i SET stock_quantity = i.stock_quantity - pi.quantity_required
                FROM product_ingredients pi WHERE pi.inventory_id = i.id AND pi.product_id = $1
            `, [item.id]);

            if (item.selectedMods && item.selectedMods.length > 0) {
                for (let mod of item.selectedMods) {
                    await client.query(
                        `INSERT INTO order_item_modifiers (order_item_id, modifier_id, price_adjustment_at_sale)
                         VALUES ($1, $2, $3)`,
                        [orderItemId, mod.mod_id, mod.price_adjustment]
                    );

                    await client.query(`
                        UPDATE inventory i SET stock_quantity = i.stock_quantity - mi.quantity_required
                        FROM modifier_ingredients mi WHERE mi.inventory_id = i.id AND mi.modifier_id = $1
                    `, [mod.mod_id]);
                }
            }
        }
        await client.query('COMMIT'); 
        res.json({ success: true, orderId: orderId });
    } catch (err) {
        await client.query('ROLLBACK'); 
        console.error("Transaction Error:", err.message);
        res.status(500).json({ success: false, error: "Checkout failed" });
    } finally {
        client.release(); 
    }
});

// 5. Dashboard Route
app.get('/api/dashboard', async (req, res) => {
    try {
        const statsResult = await pool.query(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_revenue FROM orders;`);
        const recentOrders = await pool.query(`SELECT id, total_amount, payment_method, created_at FROM orders ORDER BY created_at DESC LIMIT 5;`);
        res.json({ success: true, stats: statsResult.rows[0], recentOrders: recentOrders.rows });
    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json({ success: false, error: "Failed to fetch dashboard" });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ KDEB Coffee Server is running on http://localhost:${PORT}`));