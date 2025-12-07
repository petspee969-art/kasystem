
import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Configuração básica da conexão (sem o banco inicialmente)
const dbConfig = {
    host: '127.0.0.1', // ALTERADO: Usa IP direto em vez de 'localhost' para evitar erros no Windows
    user: 'root',      // Padrão do XAMPP
    password: '',      // Padrão do XAMPP (vazio). Se você mudou a senha do root no XAMPP, coloque aqui.
    dateStrings: true,
    multipleStatements: true
};

const DB_NAME = 'confeccao_db';

app.use(cors());
app.use(express.json());

let pool;

// Scripts de Criação das Tabelas
const INIT_SQL = `
    CREATE DATABASE IF NOT EXISTS ${DB_NAME};
    USE ${DB_NAME};

    CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        username VARCHAR(50) UNIQUE,
        password VARCHAR(50),
        role VARCHAR(20)
    );

    CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        reference VARCHAR(50),
        color VARCHAR(50),
        grid_type VARCHAR(20),
        stock JSON,
        enforce_stock BOOLEAN DEFAULT 0,
        base_price DECIMAL(10, 2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(50) PRIMARY KEY,
        rep_id VARCHAR(50),
        name VARCHAR(100),
        city VARCHAR(100),
        neighborhood VARCHAR(100),
        state VARCHAR(2)
    );

    CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        display_id INT,
        romaneio VARCHAR(50),
        is_partial BOOLEAN DEFAULT 0,
        rep_id VARCHAR(50),
        rep_name VARCHAR(100),
        client_id VARCHAR(50),
        client_name VARCHAR(100),
        client_city VARCHAR(100),
        client_state VARCHAR(2),
        created_at DATETIME,
        delivery_date DATE,
        payment_method VARCHAR(100),
        status VARCHAR(20),
        items JSON,
        total_pieces INT,
        subtotal_value DECIMAL(10, 2),
        discount_type VARCHAR(20),
        discount_value DECIMAL(10, 2),
        final_total_value DECIMAL(10, 2)
    );

    CREATE TABLE IF NOT EXISTS rep_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rep_id VARCHAR(50),
        reference VARCHAR(50),
        price DECIMAL(10, 2)
    );

    CREATE TABLE IF NOT EXISTS app_config (
        \`key\` VARCHAR(50) PRIMARY KEY,
        value JSON
    );

    -- GARANTE QUE O ADMIN EXISTA COM A SENHA CORRETA
    INSERT INTO users (id, name, username, password, role) 
    VALUES ('1', 'Administrador', 'admin', 'admin', 'admin')
    ON DUPLICATE KEY UPDATE password = 'admin', role = 'admin';
`;

async function initDB() {
    try {
        console.log('🔄 Tentando conectar ao MySQL em 127.0.0.1...');
        // 1. Conecta sem especificar o banco para poder criá-lo
        const connection = await mysql.createConnection(dbConfig);
        
        console.log('🔄 Conectado! Verificando banco de dados...');
        await connection.query(INIT_SQL);
        console.log('✅ Banco de dados configurado com sucesso.');
        console.log('✅ Usuário ADMIN garantido (Login: admin / Senha: admin)');
        
        await connection.end();

        // 2. Inicializa o Pool conectado ao banco correto
        pool = mysql.createPool({
            ...dbConfig,
            database: DB_NAME
        });

    } catch (err) {
        console.error('\n❌ ERRO CRÍTICO NO BANCO DE DADOS:');
        console.error(`Mensagem: ${err.message}`);
        
        if (err.code === 'ECONNREFUSED') {
            console.error('👉 O XAMPP (MySQL) parece estar DESLIGADO ou em outra porta.');
            console.error('👉 Abra o painel do XAMPP e clique em START no MySQL.');
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('👉 Senha do banco incorreta! Se você colocou senha no root do XAMPP, atualize a variável dbConfig no arquivo server.js.');
        }
        console.error('\n');
    }
}

initDB();

// Middleware para verificar se o banco está pronto
app.use((req, res, next) => {
    if (!pool) {
        return res.status(500).json({ error: 'O servidor não conseguiu conectar ao banco de dados. Verifique o terminal.' });
    }
    next();
});

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
        const products = rows.map(p => ({
            ...p,
            stock: typeof p.stock === 'string' ? JSON.parse(p.stock) : p.stock,
            enforce_stock: !!p.enforce_stock,
            base_price: parseFloat(p.base_price)
        }));
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const data = req.body;
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
            is_partial: !!o.is_partial,
            subtotal_value: parseFloat(o.subtotal_value),
            discount_value: parseFloat(o.discount_value),
            final_total_value: parseFloat(o.final_total_value)
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
        // MySQL converte JSON para string automaticamente se a coluna for JSON,
        // mas em algumas versões/drivers é bom garantir.
        const valToSave = JSON.stringify(value); 
        
        if (exists.length > 0) {
            await pool.query('UPDATE app_config SET value = ? WHERE `key` = ?', [valToSave, key]);
        } else {
            await pool.query('INSERT INTO app_config SET ?', { key, value: valToSave });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend rodando em http://localhost:${PORT}`);
    console.log(`   (Certifique-se que o XAMPP MySQL está rodando na porta 3306)`);
});
