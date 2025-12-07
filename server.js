
import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3001;

// Configuração do Banco de Dados
const dbConfig = {
    host: 'localhost',
    user: 'root',      // Altere conforme seu usuário MySQL
    password: '',      // Altere conforme sua senha MySQL
    database: 'confeccao_db',
    dateStrings: true // Importante para datas retornarem como string
};

app.use(cors());
app.use(bodyParser.json());

let pool;

async function connectDB() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('Conectado ao MySQL');
    } catch (err) {
        console.error('Erro ao conectar ao MySQL:', err);
    }
}

connectDB();

// --- ROTAS USERS ---
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { id, name, username, password, role } = req.body;
        await pool.query('INSERT INTO users SET ?', { id, name, username, password, role });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTAS PRODUCTS ---
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        // O driver mysql2 geralmente parseia JSON automaticamente, mas garantimos aqui
        const products = rows.map(p => ({
            ...p,
            stock: typeof p.stock === 'string' ? JSON.parse(p.stock) : p.stock,
            enforce_stock: !!p.enforce_stock
        }));
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const data = req.body;
        // Stringify JSON para salvar
        const dbData = { ...data, stock: JSON.stringify(data.stock) };
        await pool.query('INSERT INTO products SET ?', dbData);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { stock, enforce_stock, base_price } = req.body;
        await pool.query(
            'UPDATE products SET stock = ?, enforce_stock = ?, base_price = ? WHERE id = ?',
            [JSON.stringify(stock), enforce_stock, base_price, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTAS CLIENTS ---
app.get('/api/clients', async (req, res) => {
    try {
        let query = 'SELECT * FROM clients';
        let params = [];
        if (req.query.rep_id) {
            query += ' WHERE rep_id = ?';
            params.push(req.query.rep_id);
        }
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clients', async (req, res) => {
    try {
        await pool.query('INSERT INTO clients SET ?', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clients/:id', async (req, res) => {
    try {
        await pool.query('UPDATE clients SET ? WHERE id = ?', [req.body, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clients/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTAS REP PRICES ---
app.get('/api/rep_prices', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM rep_prices WHERE rep_id = ?', [req.query.rep_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rep_prices', async (req, res) => {
    try {
        const { rep_id, reference, price } = req.body;
        // Upsert logic (Insert or Update)
        const [exists] = await pool.query('SELECT id FROM rep_prices WHERE rep_id = ? AND reference = ?', [rep_id, reference]);
        
        if (exists.length > 0) {
            await pool.query('UPDATE rep_prices SET price = ? WHERE id = ?', [price, exists[0].id]);
        } else {
            await pool.query('INSERT INTO rep_prices SET ?', { rep_id, reference, price });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTAS ORDERS ---
app.get('/api/orders', async (req, res) => {
    try {
        let query = 'SELECT * FROM orders';
        // Simples validação de unicidade de romaneio via GET se necessário
        if (req.query.romaneio) {
            query += ` WHERE romaneio = '${req.query.romaneio}'`;
            if (req.query.excludeId) {
                query += ` AND id != '${req.query.excludeId}'`;
            }
        }
        
        const [rows] = await pool.query(query);
        const orders = rows.map(o => ({
            ...o,
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            is_partial: !!o.is_partial
        }));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            const order = rows[0];
            order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            order.is_partial = !!order.is_partial;
            res.json(order);
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const data = req.body;
        const dbOrder = { ...data, items: JSON.stringify(data.items) };
        await pool.query('INSERT INTO orders SET ?', dbOrder);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/orders/:id', async (req, res) => {
    try {
        const data = req.body;
        if (data.items) {
            data.items = JSON.stringify(data.items);
        }
        await pool.query('UPDATE orders SET ? WHERE id = ?', [data, req.params.id]);
        // Retorna o pedido atualizado para sincronia
        const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        const order = rows[0];
        order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTA CONFIG (SEQUENCIAL) ---
app.get('/api/config/:key', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT value FROM app_config WHERE `key` = ?', [req.params.key]);
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { key, value } = req.body;
        const [exists] = await pool.query('SELECT `key` FROM app_config WHERE `key` = ?', [key]);
        if (exists.length > 0) {
            await pool.query('UPDATE app_config SET value = ? WHERE `key` = ?', [value, key]);
        } else {
            await pool.query('INSERT INTO app_config SET ?', { key, value });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server rodando em http://localhost:${PORT}`);
});
