import 'dotenv/config'; // Carrega variáveis do arquivo .env
import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Configuração para __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Render ou Hostinger fornecem a porta via process.env.PORT
const PORT = process.env.PORT || 3001;

// Configuração da conexão com Banco de Dados
// Se DB_HOST for definido mas for localhost, tratamos como ambiente "controlável" para criar o banco
const isCloudDatabase = !!process.env.DB_HOST && process.env.DB_HOST !== '127.0.0.1' && process.env.DB_HOST !== 'localhost';

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1', 
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',      
    password: process.env.DB_PASSWORD || '',      
    database: process.env.DB_NAME || 'confeccao_db',
    dateStrings: true,
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Configuração SSL apenas se for banco na nuvem (AWS RDS, Azure, etc)
    ssl: isCloudDatabase ? { rejectUnauthorized: false } : undefined
};

app.use(cors());
app.use(express.json());

// Middleware de Log
app.use((req, res, next) => {
    if (!req.url.includes('.')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

let pool;

const CREATE_TABLES_SQL = `
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
        min_stock JSON,
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

    INSERT INTO users (id, name, username, password, role) 
    VALUES ('1', 'Administrador', 'admin', 'admin', 'admin')
    ON DUPLICATE KEY UPDATE password = password; 
`;

async function initDB() {
    try {
        if (isCloudDatabase) {
             console.log('☁️  Banco de Dados Externo detectado.');
             pool = mysql.createPool(dbConfig);
             await pool.query('SELECT 1');
             console.log('✅ Conexão estabelecida.');
             await pool.query(CREATE_TABLES_SQL);
             return;
        }

        // --- AMBIENTE LOCAL OU VPS (Localhost) ---
        console.log('🏠 Configurando Banco de Dados Local/VPS...');
        
        const { database, ...configWithoutDb } = dbConfig;
        
        // 1. Conecta sem especificar o banco para poder criá-lo
        const connection = await mysql.createConnection(configWithoutDb);
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${database}`);
        await connection.query(`USE ${database}`);
        
        // 2. Cria tabelas
        await connection.query(CREATE_TABLES_SQL);
        
        // 3. Migrações (se necessário)
        try {
            await connection.query(`SELECT min_stock FROM products LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'min_stock' não encontrada. Criando...");
            await connection.query(`ALTER TABLE products ADD COLUMN min_stock JSON;`);
        }

        console.log('✅ Banco de dados configurado com sucesso.');
        await connection.end();

        // 4. Cria o pool oficial
        pool = mysql.createPool(dbConfig);

    } catch (err) {
        console.error('\n❌ ERRO DE CONEXÃO COM BANCO DE DADOS:');
        console.error(err.message);
        console.error('Dica: Verifique se o MariaDB está rodando e se a senha no arquivo .env está correta.');
    }
}

initDB();

// Middleware de Banco
app.use((req, res, next) => {
    if (!pool) {
        return res.status(500).json({ error: 'Banco de dados desconectado ou iniciando...' });
    }
    next();
});

// --- SERVIR ARQUIVOS ESTÁTICOS (FRONTEND) ---
app.use(express.static(path.join(__dirname, 'dist')));

// --- ROTAS DA API ---

// Users
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const { id, name, username, password, role } = req.body;
        await pool.query('INSERT INTO users SET ?', { id, name, username, password, role });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products');
        const products = rows.map(p => ({
            ...p,
            stock: typeof p.stock === 'string' ? JSON.parse(p.stock) : (p.stock || {}),
            min_stock: typeof p.min_stock === 'string' ? JSON.parse(p.min_stock) : (p.min_stock || {}),
            enforce_stock: !!p.enforce_stock,
            base_price: parseFloat(p.base_price)
        }));
        res.json(products);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const data = req.body;
        const dbData = { 
            ...data, 
            stock: JSON.stringify(data.stock),
            min_stock: JSON.stringify(data.min_stock || {})
        };
        await pool.query('INSERT INTO products SET ?', dbData);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { stock, min_stock, enforce_stock, base_price } = req.body;
        await pool.query(
            'UPDATE products SET stock = ?, min_stock = ?, enforce_stock = ?, base_price = ? WHERE id = ?',
            [JSON.stringify(stock), JSON.stringify(min_stock || {}), enforce_stock, base_price, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clients
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients', async (req, res) => {
    try {
        await pool.query('INSERT INTO clients SET ?', req.body);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
    try {
        await pool.query('UPDATE clients SET ? WHERE id = ?', [req.body, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clients/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rep Prices
app.get('/api/rep_prices', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM rep_prices WHERE rep_id = ?', [req.query.rep_id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Orders
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
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const data = req.body;
        const dbOrder = { ...data, items: JSON.stringify(data.items) };
        await pool.query('INSERT INTO orders SET ?', dbOrder);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Config
app.get('/api/config/:key', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT value FROM app_config WHERE `key` = ?', [req.params.key]);
        res.json(rows[0] || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config', async (req, res) => {
    try {
        const { key, value } = req.body;
        const [exists] = await pool.query('SELECT `key` FROM app_config WHERE `key` = ?', [key]);
        const valToSave = JSON.stringify(value); 
        
        if (exists.length > 0) {
            await pool.query('UPDATE app_config SET value = ? WHERE `key` = ?', [valToSave, key]);
        } else {
            await pool.query('INSERT INTO app_config SET ?', { key, value: valToSave });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTA CATCH-ALL (PARA REACT ROUTER) ---
app.get('*', (req, res) => {
    // Verifica se o build existe antes de tentar enviar
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <div style="font-family: sans-serif; padding: 20px; text-align: center;">
                <h1>⚠️ Frontend não encontrado</h1>
                <p>Você rodou <code>npm start</code>, mas a pasta <code>dist</code> não existe.</p>
                <hr/>
                <h3>Como resolver:</h3>
                <p>1. Para <strong>DESENVOLVIMENTO</strong> (recomendado agora):</p>
                <pre style="background: #eee; padding: 10px; display: inline-block; border-radius: 5px;">npm run dev</pre>
                <p>2. Para <strong>PRODUÇÃO</strong>:</p>
                <pre style="background: #eee; padding: 10px; display: inline-block; border-radius: 5px;">npm run build\nnpm start</pre>
            </div>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});