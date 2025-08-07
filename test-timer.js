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

// Funkcja do automatycznego zmieniania statusów rezerwacji (skopiowana z server.js)
async function checkAndUpdateReservationStatuses() {
  try {
    console.log('🔍 DEBUG WYGASANIE - SPRAWDZAM STATUSY REZERWACJI...');
    console.log('⏰ Czas sprawdzenia:', new Date().toLocaleString('pl-PL'));
    console.log('🔍 DEBUG WYGASANIE - Timer główny uruchomiony (co 10 sekund)');
    
    // Debug: sprawdź aktualny czas w bazie
    const [currentTime] = await pool.query('SELECT NOW()');
    console.log('🔍 DEBUG WYGASANIE - AKTUALNY CZAS W BAZIE:', currentTime[0]['NOW()']);
    
    // KROK 1: Znajdź rezerwacje "oczekująca" starsze niż 15 sekund (TEST)
    console.log('🔍 DEBUG WYGASANIE - Szukam rezerwacji "oczekująca" starszych niż 15 sekund...');
    const [expiredReservations] = await pool.query(`
      SELECT id, spot_id, date, end_date, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      WHERE status = 'oczekująca' 
      AND created_at < DATE_SUB(NOW(), INTERVAL 15 SECOND)
    `);
    
    console.log('🔍 DEBUG WYGASANIE - ZNALEZIONE WYGASŁE REZERWACJE:', expiredReservations.length);
    
    // Debug: pokaż szczegóły każdej rezerwacji
    for (const res of expiredReservations) {
      console.log(`🔍 DEBUG WYGASANIE - Rezerwacja ${res.id}:`);
      console.log('  created_at:', res.created_at);
      console.log('  seconds_old:', res.seconds_old);
      console.log('  payment_id:', res.payment_id);
    }
    
    // Sprawdź wszystkie rezerwacje "oczekująca" żeby zobaczyć czy w ogóle są jakieś
    const [allWaiting] = await pool.query(`
      SELECT id, created_at, TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old, payment_id
      FROM reservations 
      WHERE status = 'oczekująca'
      ORDER BY created_at DESC
    `);
    
    console.log('🔍 DEBUG WYGASANIE - WSZYSTKIE REZERWACJE "OCZEKUJĄCA" (łącznie:', allWaiting.length, '):');
    for (const res of allWaiting) {
      console.log(`  ID: ${res.id}, created_at: ${res.created_at}, seconds_old: ${res.seconds_old}, payment_id: ${res.payment_id}`);
    }
    
    if (expiredReservations.length > 0) {
      console.log(`🔍 DEBUG WYGASANIE - Znaleziono ${expiredReservations.length} wygasłych rezerwacji`);
      
      for (const reservation of expiredReservations) {
        console.log(`🔍 DEBUG WYGASANIE - Przetwarzam rezerwację ${reservation.id}:`);
        console.log('  spot_id:', reservation.spot_id);
        console.log('  date:', reservation.date);
        console.log('  end_date:', reservation.end_date);
        console.log('  created_at:', reservation.created_at);
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
        
        // Zmień status na odpowiedni
        await pool.query(
          'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
          [newStatus, reservation.id]
        );
        
        console.log(`🔄 Zmieniono status rezerwacji ${reservation.id} z "oczekująca" na "${newStatus}"`);
        
        // Jeśli status to "nieoplacona", usuń blokady
        if (newStatus === 'nieoplacona') {
          console.log(`🔓 Usuwam blokady dla rezerwacji ${reservation.id} (status: nieoplacona)`);
          // Tu można dodać usuwanie blokad
        }
      }
      
      console.log(`🔍 DEBUG WYGASANIE - Zmieniono status ${expiredReservations.length} rezerwacji`);
    } else {
      console.log('🔍 DEBUG WYGASANIE - Brak wygasłych rezerwacji');
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania statusów rezerwacji:', error);
  }
}

// Uruchom timer co 10 sekund
console.log('🚀 Uruchamiam timer główny (co 10 sekund)...');
setInterval(checkAndUpdateReservationStatuses, 10000);

// Uruchom pierwsze sprawdzenie od razu
checkAndUpdateReservationStatuses();

console.log('⏰ Timer uruchomiony. Naciśnij Ctrl+C aby zatrzymać.'); 