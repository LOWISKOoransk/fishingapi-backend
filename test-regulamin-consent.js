// Skrypt testowy dla systemu zgód regulaminu
// Uruchom: node test-regulamin-consent.js

const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Zmień na właściwy URL
const ADMIN_TOKEN = 'your_admin_token_here'; // Zmień na właściwy token admina

// Test 1: Rezerwacja bez akceptacji regulaminu (powinna się nie powieść)
async function testReservationWithoutConsent() {
  console.log('\n🧪 TEST 1: Rezerwacja bez akceptacji regulaminu');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/reservations`, {
      first_name: 'Jan',
      last_name: 'Testowy',
      phone: '123456789',
      car_plate: 'TEST123',
      email: 'test@example.com',
      spot_id: 1,
      date: '2025-02-01',
      start_time: '11:00',
      end_date: '2025-02-01',
      end_time: '10:00',
      amount: 70,
      captcha_token: 'test_captcha',
      regulamin_consent: false // Brak zgody na regulamin
    });
    
    console.log('❌ TEST NIEUDANY: Rezerwacja została utworzona mimo braku zgody');
    console.log('Odpowiedź:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ TEST UDANY: Rezerwacja została odrzucona z powodu braku zgody');
      console.log('Błąd:', error.response.data.error);
    } else {
      console.log('❌ TEST NIEUDANY: Nieoczekiwany błąd');
      console.log('Błąd:', error.message);
    }
  }
}

// Test 2: Rezerwacja z akceptacją regulaminu (powinna się powieść)
async function testReservationWithConsent() {
  console.log('\n🧪 TEST 2: Rezerwacja z akceptacją regulaminu');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/reservations`, {
      first_name: 'Anna',
      last_name: 'Testowa',
      phone: '987654321',
      car_plate: 'TEST456',
      email: 'anna@example.com',
      spot_id: 2,
      date: '2025-02-02',
      start_time: '11:00',
      end_date: '2025-02-02',
      end_time: '10:00',
      amount: 70,
      captcha_token: 'test_captcha',
      regulamin_consent: true // Zgoda na regulamin
    });
    
    console.log('✅ TEST UDANY: Rezerwacja została utworzona z zgodą na regulamin');
    console.log('Odpowiedź:', response.data);
    
    // Zapisz token do dalszych testów
    return response.data.token;
  } catch (error) {
    console.log('❌ TEST NIEUDANY: Rezerwacja nie została utworzona');
    console.log('Błąd:', error.response?.data?.error || error.message);
    return null;
  }
}

// Test 3: Sprawdzenie statystyk zgód (wymaga tokenu admina)
async function testConsentStats() {
  console.log('\n🧪 TEST 3: Sprawdzenie statystyk zgód');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/regulamin-consents/stats`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    console.log('✅ TEST UDANY: Statystyki zostały pobrane');
    console.log('Statystyki:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('⚠️ TEST POMINIĘTY: Brak autoryzacji admina');
      console.log('Ustaw ADMIN_TOKEN w skrypcie');
    } else {
      console.log('❌ TEST NIEUDANY: Błąd podczas pobierania statystyk');
      console.log('Błąd:', error.response?.data?.error || error.message);
    }
  }
}

// Test 4: Sprawdzenie listy zgód (wymaga tokenu admina)
async function testConsentList() {
  console.log('\n🧪 TEST 4: Sprawdzenie listy zgód');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/regulamin-consents`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    console.log('✅ TEST UDANY: Lista zgód została pobrana');
    console.log(`Liczba zgód: ${response.data.length}`);
    
    // Pokaż pierwsze 3 zgody
    if (response.data.length > 0) {
      console.log('Przykładowe zgody:');
      response.data.slice(0, 3).forEach((consent, index) => {
        console.log(`${index + 1}. ${consent.first_name} ${consent.last_name} - Regulamin: ${consent.regulamin_consent ? 'Tak' : 'Nie'}`);
      });
    }
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('⚠️ TEST POMINIĘTY: Brak autoryzacji admina');
      console.log('Ustaw ADMIN_TOKEN w skrypcie');
    } else {
      console.log('❌ TEST NIEUDANY: Błąd podczas pobierania listy zgód');
      console.log('Błąd:', error.response?.data?.error || error.message);
    }
  }
}

// Test 5: Sprawdzenie struktury bazy danych
async function testDatabaseStructure() {
  console.log('\n🧪 TEST 5: Sprawdzenie struktury bazy danych');
  
  try {
    // Sprawdź czy endpoint rezerwacji obsługuje pole regulamin_consent
    const response = await axios.post(`${BASE_URL}/api/reservations`, {
      first_name: 'Test',
      last_name: 'Struktury',
      phone: '111222333',
      car_plate: 'STR123',
      email: 'struktura@test.com',
      spot_id: 3,
      date: '2025-02-03',
      start_time: '11:00',
      end_date: '2025-02-03',
      end_time: '10:00',
      amount: 70,
      captcha_token: 'test_captcha',
      regulamin_consent: true
    });
    
    console.log('✅ TEST UDANY: Baza danych obsługuje pole regulamin_consent');
    console.log('Token rezerwacji:', response.data.token);
    
    // Usuń testową rezerwację
    try {
      await axios.delete(`${BASE_URL}/api/reservations/${response.data.id}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        }
      });
      console.log('🧹 Usunięto testową rezerwację');
    } catch (deleteError) {
      console.log('⚠️ Nie udało się usunąć testowej rezerwacji (może wymagać admina)');
    }
    
  } catch (error) {
    if (error.response && error.response.status === 500) {
      console.log('❌ TEST NIEUDANY: Błąd bazy danych - pole regulamin_consent może nie istnieć');
      console.log('Uruchom skrypt add_regulamin_consent.sql');
    } else {
      console.log('❌ TEST NIEUDANY: Nieoczekiwany błąd');
      console.log('Błąd:', error.response?.data?.error || error.message);
    }
  }
}

// Główna funkcja testowa
async function runAllTests() {
  console.log('🚀 Uruchamiam testy systemu zgód regulaminu...');
  console.log('URL:', BASE_URL);
  
  try {
    // Test 1: Rezerwacja bez zgody
    await testReservationWithoutConsent();
    
    // Test 2: Rezerwacja z zgodą
    const token = await testReservationWithConsent();
    
    // Test 3: Statystyki (jeśli mamy token admina)
    await testConsentStats();
    
    // Test 4: Lista zgód (jeśli mamy token admina)
    await testConsentList();
    
    // Test 5: Struktura bazy danych
    await testDatabaseStructure();
    
    console.log('\n🎉 Wszystkie testy zostały wykonane!');
    
    if (token) {
      console.log('\n📋 Aby sprawdzić rezerwację w przeglądarce:');
      console.log(`${BASE_URL}/rezerwacja/${token}`);
    }
    
  } catch (error) {
    console.error('💥 Błąd podczas wykonywania testów:', error.message);
  }
}

// Uruchom testy jeśli skrypt jest uruchamiany bezpośrednio
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testReservationWithoutConsent,
  testReservationWithConsent,
  testConsentStats,
  testConsentList,
  testDatabaseStructure,
  runAllTests
};
