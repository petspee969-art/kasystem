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
const PORT = process.env.PORT || 3001;

// Configuração da conexão com Banco de Dados
// Na VPS, geralmente é local (127.0.0.1). Se usar banco externo, preencha o DB_HOST no .env
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
    // Apenas rejeita não autorizado se for nuvem externa
    ssl: isCloudDatabase ? { rejectUnauthorized: false } : undefined
};

app.use(cors());
app.use(express.json());

// Middleware de Log para monitorar requisições na VPS via 'pm2 logs'
app.use((req, res, next) => {
    // Loga apenas requisições de API para não poluir com arquivos estáticos
    if (req.url.startsWith('/api')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

let pool;
let dbError = null;

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
        state VARCHAR(2),
        cpf_cnpj VARCHAR(20),
        mobile VARCHAR(20)
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
        console.log('🔄 Tentando conectar ao banco de dados...');
        console.log(`   Host: ${dbConfig.host}`);
        console.log(`   User: ${dbConfig.user}`);
        console.log(`   Database: ${dbConfig.database}`);
        
        // Conexão inicial
        if (isCloudDatabase) {
             pool = mysql.createPool(dbConfig);
             await pool.query('SELECT 1');
             console.log('✅ Conexão Nuvem estabelecida.');
        } else {
            // Setup Local (Cria database se não existir)
            const { database, ...configWithoutDb } = dbConfig;
            const connection = await mysql.createConnection(configWithoutDb);
            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
            await connection.end();
            
            // Conecta com o banco selecionado
            pool = mysql.createPool(dbConfig);
        }

        // Cria tabelas
        const connection = await pool.getConnection();
        await connection.query(CREATE_TABLES_SQL);
        
        // --- MIGRAÇÕES AUTOMÁTICAS ---
        
        // 1. Min Stock
        try {
            await connection.query(`SELECT min_stock FROM products LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'min_stock' não encontrada em products. Criando...");
            await connection.query(`ALTER TABLE products ADD COLUMN min_stock JSON;`);
        }

        // 2. CPF/CNPJ e Celular em Clients
        try {
            await connection.query(`SELECT cpf_cnpj FROM clients LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'cpf_cnpj' não encontrada em clients. Criando...");
            await connection.query(`ALTER TABLE clients ADD COLUMN cpf_cnpj VARCHAR(20);`);
        }
        
        try {
            await connection.query(`SELECT mobile FROM clients LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'mobile' não encontrada em clients. Criando...");
            await connection.query(`ALTER TABLE clients ADD COLUMN mobile VARCHAR(20);`);
        }

        // 3. Colunas da Tabela Orders (Garantia de integridade)
        try {
            await connection.query(`SELECT romaneio FROM orders LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'romaneio' não encontrada em orders. Criando...");
            await connection.query(`ALTER TABLE orders ADD COLUMN romaneio VARCHAR(50);`);
        }
        try {
            await connection.query(`SELECT is_partial FROM orders LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'is_partial' não encontrada em orders. Criando...");
            await connection.query(`ALTER TABLE orders ADD COLUMN is_partial BOOLEAN DEFAULT 0;`);
        }
        try {
            await connection.query(`SELECT final_total_value FROM orders LIMIT 1;`);
        } catch (e) {
            console.log("⚠️ Coluna 'final_total_value' não encontrada em orders. Criando...");
            await connection.query(`ALTER TABLE orders ADD COLUMN final_total_value DECIMAL(10, 2);`);
            await connection.query(`ALTER TABLE orders ADD COLUMN subtotal_value DECIMAL(10, 2);`);
            await connection.query(`ALTER TABLE orders ADD COLUMN discount_type VARCHAR(20);`);
            await connection.query(`ALTER TABLE orders ADD COLUMN discount_value DECIMAL(10, 2);`);
        }

        connection.release();
        console.log('✅ Banco de dados configurado e tabelas verificadas!');
        dbError = null;

    } catch (err) {
        console.error('\n❌ ERRO CRÍTICO DE BANCO DE DADOS:');
        console.error(err.message);
        dbError = err.message;
    }
}

initDB();

// Middleware de verificação de Banco
app.use((req, res, next) => {
    // Se for rota de API e não tiver banco, retorna erro
    if (req.url.startsWith('/api') && !pool) {
        return res.status(500).json({ 
            error: 'Erro de conexão com Banco de Dados', 
            details: dbError || 'Iniciando conexão...' 
        });
    }
    next();
});

// --- API ROUTES ---

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
        console.log('📦 Recebendo pedido:', data.id, data.client_name);
        
        const dbOrder = { ...data, items: JSON.stringify(data.items) };
        await pool.query('INSERT INTO orders SET ?', dbOrder);
        
        console.log('✅ Pedido salvo com sucesso:', data.id);
        res.json({ success: true });
    } catch (err) { 
        console.error('❌ Erro ao salvar pedido:', err.message);
        console.error(err);
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


// --- SERVIR FRONTEND E CATCH-ALL ---

// Serve arquivos estáticos da pasta 'dist' (o build do React)
app.use(express.static(path.join(__dirname, 'dist')));

// Qualquer requisição que NÃO for /api e não for arquivo estático,
// retorna o index.html do React (para o SPA funcionar)
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    
    // Verifica se o build existe
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Mensagem amigável se o usuário esqueceu de rodar 'npm run build'
        res.status(404).send(`
            <div style="font-family: sans-serif; padding: 40px; text-align: center; background: #f0f0f0;">
                <h1 style="color: #e11d48;">⚠️ Frontend não encontrado</h1>
                <p>O servidor Node está rodando, mas não encontrou a pasta <code>dist</code> com o site.</p>
                <div style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: 20px auto; text-align: left; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                    <strong>Passos para corrigir na VPS:</strong>
                    <ol>
                        <li>Pare o servidor atual (Ctrl+C ou <code>pm2 stop gestao</code>)</li>
                        <li>Rode o comando de build: <pre style="background: #333; color: #fff; padding: 10px; border-radius: 4px;">npm run build</pre></li>
                        <li>Inicie novamente: <pre style="background: #333; color: #fff; padding: 10px; border-radius: 4px;">pm2 restart gestao</pre></li>
                    </ol>
                </div>
            </div>
        `);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📂 Servindo frontend de: ${path.join(__dirname, 'dist')}`);
});