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
app.use(express.json({ limit: '10mb' })); // Aumentado limite para pedidos grandes

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