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

async function debugReservations() {
  try {
    console.log('🔍 DEBUG - Sprawdzam rezerwacje w bazie danych...');
    
    // Sprawdź aktualny czas w bazie
    const [currentTime] = await pool.query('SELECT NOW()');
    console.log('🔍 DEBUG - AKTUALNY CZAS W BAZIE:', currentTime[0]['NOW()']);
    
    // Sprawdź wszystkie rezerwacje "oczekująca"
    const [waitingReservations] = await pool.query(`
      SELECT id, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      WHERE status = 'oczekująca'
      ORDER BY created_at DESC
    `);
    
    console.log('🔍 DEBUG - REZERWACJE "OCZEKUJĄCA" (łącznie:', waitingReservations.length, '):');
    for (const res of waitingReservations) {
      console.log(`  ID: ${res.id}, created_at: ${res.created_at}, seconds_old: ${res.seconds_old}, payment_id: ${res.payment_id}`);
    }
    
    // Sprawdź rezerwacje "oczekująca" starsze niż 15 sekund
    const [expiredReservations] = await pool.query(`
      SELECT id, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      WHERE status = 'oczekująca' 
      AND created_at < DATE_SUB(NOW(), INTERVAL 15 SECOND)
    `);
    
    console.log('🔍 DEBUG - REZERWACJE "OCZEKUJĄCA" STARSZE NIŻ 15 SEKUND (łącznie:', expiredReservations.length, '):');
    for (const res of expiredReservations) {
      console.log(`  ID: ${res.id}, created_at: ${res.created_at}, seconds_old: ${res.seconds_old}, payment_id: ${res.payment_id}`);
    }
    
    // Sprawdź wszystkie rezerwacje
    const [allReservations] = await pool.query(`
      SELECT id, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log('🔍 DEBUG - WSZYSTKIE REZERWACJE (ostatnie 10):');
    for (const res of allReservations) {
      console.log(`  ID: ${res.id}, status: ${res.status}, created_at: ${res.created_at}, seconds_old: ${res.seconds_old}, payment_id: ${res.payment_id}`);
    }
    
    // Symuluj funkcję checkAndUpdateReservationStatuses
    console.log('\n🔍 DEBUG - SYMULACJA FUNKCJI checkAndUpdateReservationStatuses:');
    
    if (expiredReservations.length > 0) {
      console.log(`🔍 DEBUG - Znaleziono ${expiredReservations.length} wygasłych rezerwacji do przetworzenia`);
      
      for (const reservation of expiredReservations) {
        console.log(`🔍 DEBUG - Przetwarzam rezerwację ${reservation.id}:`);
        console.log('  payment_id:', reservation.payment_id);
        console.log('  seconds_old:', reservation.seconds_old);
        
        let newStatus;
        
        // Sprawdź czy użytkownik rozpoczął transakcję (ma payment_id)
        if (reservation.payment_id) {
          console.log(`✅ Użytkownik rozpoczął transakcję (payment_id: ${reservation.payment_id})`);
          newStatus = 'platnosc_w_toku';
        } else {
          console.log(`❌ Użytkownik nie rozpoczął transakcji (brak payment_id)`);
          newStatus = 'nieoplacona';
        }
        
        console.log(`🔄 Zmieniam status rezerwacji ${reservation.id} z "oczekująca" na "${newStatus}"`);
        
        // Zmień status na odpowiedni
        await pool.query(
          'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
          [newStatus, reservation.id]
        );
        
        console.log(`✅ Status zaktualizowany!`);
      }
    } else {
      console.log('🔍 DEBUG - Brak wygasłych rezerwacji do przetworzenia');
    }
    
    console.log('\n🔍 DEBUG - SPRAWDZENIE PO AKTUALIZACJI:');
    
    // Sprawdź ponownie wszystkie rezerwacje
    const [updatedReservations] = await pool.query(`
      SELECT id, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log('🔍 DEBUG - REZERWACJE PO AKTUALIZACJI (ostatnie 10):');
    for (const res of updatedReservations) {
      console.log(`  ID: ${res.id}, status: ${res.status}, created_at: ${res.created_at}, seconds_old: ${res.seconds_old}, payment_id: ${res.payment_id}`);
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas debugowania:', error);
  } finally {
    await pool.end();
  }
}

// Uruchom debugowanie
debugReservations(); 