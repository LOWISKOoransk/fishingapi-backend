// Test połączenia z bazą danych i API
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('🧪 Testowanie połączenia...');
  
  // Sprawdź zmienne środowiskowe
  console.log('📋 Zmienne środowiskowe:');
  console.log('  DB_HOST:', process.env.DB_HOST);
  console.log('  DB_USER:', process.env.DB_USER);
  console.log('  DB_NAME:', process.env.DB_NAME);
  console.log('  NODE_ENV:', process.env.NODE_ENV);
  
  try {
    // Test połączenia z bazą danych
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Jankopernik1',
      database: process.env.DB_NAME || 'fishing',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+02:00'
    });
    
    console.log('🔍 Testuję połączenie z bazą danych...');
    const connection = await pool.getConnection();
    console.log('✅ Połączenie z bazą danych udane!');
    
    // Test zapytania
    const [rows] = await connection.query('SELECT 1 as test');
    console.log('✅ Zapytanie testowe udane:', rows);
    
    // Sprawdź tabele
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📋 Dostępne tabele:', tables.map(t => Object.values(t)[0]));
    
    connection.release();
    await pool.end();
    
    console.log('✅ Wszystkie testy przeszły pomyślnie!');
    
  } catch (error) {
    console.error('❌ Błąd podczas testowania:', error.message);
    console.error('   Sprawdź zmienne środowiskowe i połączenie z bazą danych');
    process.exit(1);
  }
}

testConnection(); 