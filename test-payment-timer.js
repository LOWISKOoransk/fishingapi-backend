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

// Funkcja do sprawdzania statusów płatności (skopiowana z server.js)
async function checkPaymentStatuses() {
  try {
    console.log('💰 DEBUG PŁATNOŚCI - SPRAWDZAM STATUSY PŁATNOŚCI...');
    console.log('⏰ Czas sprawdzenia płatności:', new Date().toLocaleString('pl-PL'));
    
    // Znajdź WSZYSTKIE rezerwacje "platnosc_w_toku" (niezależnie od wieku) - DYNAMICZNE SPRAWDZANIE
    const [paymentInProgressReservations] = await pool.query(`
      SELECT id, spot_id, date, end_date, status, created_at, payment_id 
      FROM reservations 
      WHERE status = 'platnosc_w_toku'
    `);
    
    console.log('💰 DEBUG PŁATNOŚCI - ZNALEZIONE REZERWACJE DO SPRAWDZENIA PŁATNOŚCI:', paymentInProgressReservations.length);
    
    if (paymentInProgressReservations.length > 0) {
      console.log(`💰 DEBUG PŁATNOŚCI - Sprawdzam płatności dla ${paymentInProgressReservations.length} rezerwacji`);
      
      for (const reservation of paymentInProgressReservations) {
        console.log(`💰 DEBUG PŁATNOŚCI - Sprawdzam płatność dla rezerwacji ${reservation.id}:`);
        console.log('  payment_id:', reservation.payment_id);
        console.log('  created_at:', reservation.created_at);
        
        // Sprawdź status płatności w Przelewy24 jeśli jest payment_id
        if (reservation.payment_id) {
          try {
            console.log('🌐 Sprawdzam status płatności w Przelewy24 dla payment_id:', reservation.payment_id);
            
            // Symuluj sprawdzenie płatności (w testach nie łączymy się z Przelewy24)
            console.log('⏳ Symuluję sprawdzenie płatności w Przelewy24...');
            
            // Dla testów - symuluj udaną płatność co 30 sekund
            const secondsOld = Math.floor((new Date() - new Date(reservation.created_at)) / 1000);
            if (secondsOld > 30) {
              console.log('✅ Symuluję udaną płatność po 30 sekundach!');
              
              // Zmień status na "opłacona"
              await pool.query(
                'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
                ['opłacona', reservation.id]
              );
              
              console.log(`🔄 Zmieniono status rezerwacji ${reservation.id} z "platnosc_w_toku" na "opłacona"`);
            } else {
              console.log('⏳ Płatność jeszcze nie została zrealizowana (symulacja)');
            }
          } catch (error) {
            console.error('❌ Błąd podczas sprawdzania statusu płatności:', error);
          }
        } else {
          console.log('❌ Brak payment_id - płatność nie została zainicjowana');
        }
      }
      
      console.log(`💰 DEBUG PŁATNOŚCI - Sprawdzono ${paymentInProgressReservations.length} rezerwacji`);
    } else {
      console.log('💰 DEBUG PŁATNOŚCI - Brak rezerwacji do sprawdzenia płatności');
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania statusów płatności:', error);
  }
}

// Uruchom timer co 5 sekund
console.log('🚀 Uruchamiam timer płatności (co 5 sekund)...');
setInterval(checkPaymentStatuses, 5000);

// Uruchom pierwsze sprawdzenie od razu
checkPaymentStatuses();

console.log('⏰ Timer płatności uruchomiony. Naciśnij Ctrl+C aby zatrzymać.'); 