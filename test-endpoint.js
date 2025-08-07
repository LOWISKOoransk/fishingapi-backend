const mysql = require('mysql2/promise');

// Połączenie z lokalną bazą MySQL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Jankopernik1',
  database: 'fishing',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+02:00'
});

async function testStatusEndpoint() {
  try {
    console.log('🔍 TEST - Sprawdzam endpoint statusu rezerwacji...');
    
    // Znajdź najnowszą rezerwację
    const [reservations] = await pool.query(`
      SELECT id, token, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (reservations.length === 0) {
      console.log('❌ Brak rezerwacji w bazie');
      return;
    }
    
    const reservation = reservations[0];
    console.log('🔍 TEST - Najnowsza rezerwacja:');
    console.log('  ID:', reservation.id);
    console.log('  Token:', reservation.token);
    console.log('  Status:', reservation.status);
    console.log('  Created_at:', reservation.created_at);
    console.log('  Seconds_old:', reservation.seconds_old);
    console.log('  Payment_id:', reservation.payment_id);
    
    // Test endpointu
    const token = reservation.token;
    console.log(`\n🔍 TEST - Testuję endpoint /api/reservation/status/${token}`);
    
    // Symuluj wywołanie endpointu
    const response = await fetch(`http://localhost:4000/api/reservation/status/${token}`);
    console.log('📡 Status odpowiedzi:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('📊 Odpowiedź endpointu:');
      console.log('  status:', data.status);
      console.log('  payment_id:', data.payment_id);
      console.log('  created_at:', data.created_at);
      console.log('  seconds_old:', data.seconds_old);
      console.log('  can_pay:', data.can_pay);
      console.log('  can_continue_payment:', data.can_continue_payment);
    } else {
      console.log('❌ Błąd endpointu:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('❌ Treść błędu:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas testowania endpointu:', error);
  } finally {
    await pool.end();
  }
}

// Uruchom test
testStatusEndpoint(); 