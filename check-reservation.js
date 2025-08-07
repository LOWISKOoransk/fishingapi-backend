const mysql = require('mysql2/promise');

async function checkReservation() {
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

  try {
    const [rows] = await pool.query(
      'SELECT id, status, payment_id, token FROM reservations WHERE token = ?',
      ['bac67272-25ac-42f2-9e7b-468050225e2a']
    );
    
    console.log('Rezerwacja w bazie:');
    console.log(JSON.stringify(rows, null, 2));
    
    if (rows.length > 0) {
      const reservation = rows[0];
      console.log('\nSzczegóły:');
      console.log('ID:', reservation.id);
      console.log('Status:', reservation.status);
      console.log('Payment ID:', reservation.payment_id);
      console.log('Token:', reservation.token);
    }
  } catch (error) {
    console.error('Błąd:', error);
  } finally {
    await pool.end();
  }
}

checkReservation(); 