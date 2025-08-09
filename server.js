// Uruchom backend poleceniem: node server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');
const crypto = require('crypto');
const axios = require('axios');

// Inicjalizacja Resend (wymaga RESEND_API_KEY w env)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.warn('⚠️ Brak RESEND_API_KEY w zmiennych środowiskowych. Wysyłka e-maili nie zadziała.');
}
const resend = new Resend(RESEND_API_KEY || '');
// Nadawca e-maili (statyczny, z możliwością nadpisania zmienną środowiskową)
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'rezerwacje@xn--rask-c2a.pl';

// Test wysyłania emaila przy starcie serwera
async function testEmailSending() {
  try {
    console.log('🧪 Testuję wysyłanie emaila...');
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: 'test@example.com',
      subject: 'Test email - Łowisko Młyn Rańsk',
      html: '<h1>Test email</h1><p>To jest test wysyłania emaila.</p>'
    });
    console.log('✅ Test email wysłany pomyślnie');
  } catch (error) {
    console.error('❌ Błąd testu emaila:', error.message);
    console.log('⚠️ Serwer uruchomi się bez testu emaila');
  }
}

// Uruchom test przy starcie
testEmailSending();

// Konfiguracja Przelewy24 – sekrety pobierane z ENV (NIE commituj prawdziwych kluczy)
const P24_CONFIG = {
  merchantId: Number(process.env.P24_MERCHANT_ID),
  posId: Number(process.env.P24_POS_ID),
  apiKey: process.env.P24_API_KEY,
  crc: process.env.P24_CRC,
  // SecretId (alias reportKey) – używany do Basic Auth w raportach/verify
  reportKey: process.env.P24_SECRET_ID || process.env.P24_REPORT_KEY,
  secretId: process.env.P24_SECRET_ID || process.env.P24_REPORT_KEY,
  sandbox: String(process.env.P24_SANDBOX).toLowerCase() === 'true' ? true : false,
  baseUrl: process.env.P24_BASE_URL || (String(process.env.P24_SANDBOX).toLowerCase() === 'true'
    ? 'https://sandbox.przelewy24.pl/api/v1'
    : 'https://secure.przelewy24.pl/api/v1')
};

// Pomocnicza funkcja do budowy URL przekierowania do bramki P24
function getP24RedirectUrl(paymentToken) {
  const host = P24_CONFIG.sandbox
    ? 'https://sandbox.przelewy24.pl'
    : 'https://secure.przelewy24.pl';
  return `${host}/trnRequest/${paymentToken}`;
}

// Konfiguracja domen
const DOMAIN_CONFIG = {
  frontend: process.env.FRONTEND_URL || 'https://lowiskomlynransk.pl',
  backend: process.env.BACKEND_URL || 'https://fishing-api-backend.onrender.com'
};

// Test połączenia z sandbox Przelewy24
async function testP24Connection() {
  try {
    console.log('Testuję połączenie z sandbox Przelewy24...');
    console.log('Używam danych:');
    console.log('  posId:', P24_CONFIG.posId);
    console.log('  reportKey:', P24_CONFIG.reportKey);
    console.log('  baseUrl:', P24_CONFIG.baseUrl);
    

    // Sprawdź IP z którego wysyłamy żądanie
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      console.log('🌐 IP z którego wysyłamy żądanie:', ipData.ip);
    } catch (ipError) {
      console.log('⚠️ Nie udało się sprawdzić IP:', ipError.message);
    }
    
    const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
    console.log('Authorization:', `Basic ${auth}`);
    
    const response = await fetch(`${P24_CONFIG.baseUrl}/testAccess`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });
    console.log('Status testu połączenia:', response.status);
    const data = await response.json();
    console.log('Odpowiedź testu:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Błąd testu połączenia:', error);
    return null;
  }
}

// Funkcja do obliczania czasu pobytu
function getDurationText(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) {
    return '1 dobę';
  } else if (diffDays >= 2 && diffDays <= 4) {
    return `${diffDays} doby`;
  } else {
    return `${diffDays} dób`;
  }
}

// Funkcje do obsługi Przelewy24
function generateP24Signature(params) {
  // Dla /api/v1/transaction/register - zgodnie z dokumentacją
  const { merchantId, sessionId, amount, currency } = params;
  
  // Twórz obiekt JSON zgodnie z dokumentacją
  const signParams = {
    sessionId: sessionId,
    merchantId: merchantId,
    amount: amount,
    currency: currency,
    crc: P24_CONFIG.crc
  };
  
  // JSON z flagami zgodnie z dokumentacją
  const jsonString = JSON.stringify(signParams);
  return crypto.createHash('sha384').update(jsonString).digest('hex');
}

// Suma kontrolna dla rejestracji transakcji
function calculateRegistrationSign(sessionId, amount, currency = 'PLN') {
  const params = {
    sessionId: sessionId,
    merchantId: P24_CONFIG.merchantId,
    amount: amount,
    currency: currency,
    crc: P24_CONFIG.crc
  };
  
  const jsonString = JSON.stringify(params, null, 0);
  return crypto.createHash('sha384').update(jsonString).digest('hex');
}

// Suma kontrolna dla weryfikacji transakcji
function calculateVerificationSign(sessionId, orderId, amount, currency = 'PLN') {
  const params = {
    sessionId: sessionId,
    orderId: orderId,
    amount: amount,
    currency: currency,
    crc: P24_CONFIG.crc
  };
  
  const jsonString = JSON.stringify(params, null, 0);
  return crypto.createHash('sha384').update(jsonString).digest('hex');
}

// Suma kontrolna dla notyfikacji
function calculateNotificationSign(notification) {
  const params = {
    merchantId: notification.merchantId,
    posId: notification.posId,
    sessionId: notification.sessionId,
    amount: notification.amount,
    originAmount: notification.originAmount,
    currency: notification.currency,
    orderId: notification.orderId,
    methodId: notification.methodId,
    statement: notification.statement,
    crc: P24_CONFIG.crc
  };
  
  const jsonString = JSON.stringify(params, null, 0);
  return crypto.createHash('sha384').update(jsonString).digest('hex');
}

// Generowanie unikalnego sessionId
function generateUniqueSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Funkcja weryfikacji transakcji
async function verifyTransaction(sessionId, orderId, amount, currency = 'PLN') {
  const verificationData = {
    merchantId: P24_CONFIG.merchantId,
    posId: P24_CONFIG.posId,
    sessionId: sessionId,
    amount: amount,
    currency: currency,
    orderId: orderId,
    sign: calculateVerificationSign(sessionId, orderId, amount, currency)
  };

  console.log('🔐 Weryfikuję transakcję:', verificationData);

  const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/verify`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64')}`
    },
    body: JSON.stringify(verificationData)
  });

  const result = await response.json();
  console.log('📋 Wynik weryfikacji:', result);
  return result;
}

async function createP24Payment(reservation, amount) {
  const sessionId = `res_${reservation.id}_${Date.now()}`;
  const amountInGrosz = Math.round(amount * 100); // Konwersja na grosze
  
  const p24Params = {
    merchantId: parseInt(P24_CONFIG.merchantId),
    posId: parseInt(P24_CONFIG.posId),
    sessionId: sessionId,
    amount: amountInGrosz,
    currency: 'PLN',
          description: `Rezerwacja ID: ${reservation.id} - Stanowisko ${reservation.spot_id} - ${new Date(reservation.date).toLocaleDateString('pl-PL')}`,
    email: reservation.email,
    country: 'PL',
    urlReturn: `${DOMAIN_CONFIG.frontend}/payment/return/${reservation.token}?fromPayment=true`,
    urlStatus: `${DOMAIN_CONFIG.backend}/api/payment/p24/status`,
    client: `${reservation.first_name} ${reservation.last_name}`,
    address: '',
    zip: '',
    city: '',
    phone: reservation.phone || '',
    language: 'pl',
    timeLimit: 5
  };
  
  // Generuj podpis dla /api/v1/transaction/register
  p24Params.sign = generateP24Signature(p24Params);
  
      console.log('🚀 PRZELEWY24 - Wysyłam transakcję:');
    console.log('   sessionId:', p24Params.sessionId);
    console.log('   amount:', p24Params.amount, 'groszy');
    console.log('   timeLimit:', p24Params.timeLimit, 'minut ⏰');
    console.log('   email:', p24Params.email);
    console.log('   URL:', `${P24_CONFIG.baseUrl}/transaction/register`);
  
  try {
    // Użyj nowego API /api/v1/transaction/register
    const authString = `${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
    
    const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/register`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(p24Params)
    });
    
    console.log('📡 Status odpowiedzi Przelewy24:', response.status);
    
    // Sprawdź odpowiedź
    if (response.status !== 200) {
      const errorData = await response.json();
      console.log('❌ Błąd Przelewy24:', errorData.error || 'Nieznany błąd');
      throw new Error(`Błąd Przelewy24: ${errorData.error || 'Nieznany błąd'}`);
    }
    
    const data = await response.json();
    console.log('✅ Transakcja utworzona pomyślnie!');
    console.log('   Token płatności:', data.data?.token);
    console.log('   Pełna odpowiedź:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Błąd podczas tworzenia płatności Przelewy24:', error);
    throw error;
  }
}



// Funkcja do sprawdzania płatności co 5 sekund dla rezerwacji "platnosc_w_toku"
async function checkPaymentStatuses() {
  try {
    // Sprawdź czy baza danych jest dostępna
    const dbPool = await checkDatabaseConnection();

    // Znajdź WSZYSTKIE rezerwacje "platnosc_w_toku" (niezależnie od wieku) - DYNAMICZNE SPRAWDZANIE
    const [paymentInProgressReservations] = await dbPool.query(`
      SELECT id, spot_id, date, end_date, status, created_at, payment_id 
      FROM reservations 
      WHERE status = 'platnosc_w_toku'
    `);
    
    if (paymentInProgressReservations.length > 0) {
      for (const reservation of paymentInProgressReservations) {
        
        // Sprawdź status płatności w Przelewy24 jeśli jest payment_id
        if (reservation.payment_id) {
          try {
            const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
            
            const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/status/${reservation.payment_id}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
              }
            });
            
            if (response.status === 200) {
              const paymentData = await response.json();
              
              // Sprawdź czy płatność została zrealizowana
              // Status 1 = udana płatność, Status 0 = oczekująca
              if (paymentData.data && paymentData.data.status === 1) { // 1 = udana płatność
                // Zmień status na "opłacona"
                await dbPool.query(
                  'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
                  ['opłacona', reservation.id]
                );
                
                // Zmień source blokad z 'reservation' na 'paid_reservation' (rezerwacja potwierdzona)
                const startDate = formatDateForDisplay(reservation.date);
                const endDate = formatDateForDisplay(reservation.end_date);
                
                // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
                // NIE blokuj dnia wyjazdu (end_date) - to dzień wyjazdu o 10:00
                const blockDates = [];
                let currentDate = new Date(startDate + 'T00:00:00');
                const endDateObj = new Date(endDate + 'T00:00:00');
                while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
                  // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
                  const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  blockDates.push(dateStr);
                  currentDate.setDate(currentDate.getDate() + 1);
                }
                
                // Usuń stare blokady z source 'reservation' i dodaj nowe z source 'paid_reservation'
                for (const blockDate of blockDates) {
                  try {
                    // Usuń starą blokadę
                    await dbPool.query(
                      'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
                      [reservation.spot_id, blockDate, 'reservation']
                    );
                    
                    // Dodaj nową blokadę z source 'paid_reservation'
                    await dbPool.query(
                      'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
                      [reservation.spot_id, blockDate, 'paid_reservation']
                    );
                  } catch (error) {
                    console.error(`❌ Błąd podczas zmiany source blokady:`, error);
                  }
                }
                
                // Wyślij email z potwierdzeniem
                await sendPaymentConfirmationEmail(reservation);
              }
            } else {
              console.error('❌ Nie udało się sprawdzić statusu płatności');
            }
          } catch (error) {
            console.error('❌ Błąd podczas sprawdzania statusu płatności:', error);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania statusów płatności:', error);
  }
}

// Funkcja do automatycznego zmieniania statusów rezerwacji
async function checkAndUpdateReservationStatuses() {
  try {
    // Sprawdź czy baza danych jest dostępna
    const dbPool = await checkDatabaseConnection();

    // KROK 1: Znajdź rezerwacje "oczekująca" starsze niż 900 sekund (dokładnie 15 minut)
    const [expiredReservations] = await dbPool.query(`
      SELECT id, spot_id, date, end_date, status, created_at, payment_id,
             TIMESTAMPDIFF(SECOND, created_at, NOW()) as seconds_old
      FROM reservations 
      WHERE status = 'oczekująca' 
      AND TIMESTAMPDIFF(SECOND, created_at, NOW()) >= 900
    `);
    
    if (expiredReservations.length > 0) {
      for (const reservation of expiredReservations) {
        
        let newStatus;
        
        // Sprawdź czy użytkownik rozpoczął transakcję (ma payment_id)
        if (reservation.payment_id) {
          newStatus = 'platnosc_w_toku';
        } else {
          newStatus = 'nieoplacona';
        }
        
        // Zmień status na odpowiedni
        await dbPool.query(
          'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
          [newStatus, reservation.id]
        );
        
        // Jeśli status to "nieoplacona", usuń blokady
        if (newStatus === 'nieoplacona') {
          const startDate = formatDateForDisplay(reservation.date);
          const endDate = formatDateForDisplay(reservation.end_date);
          
          // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
          // NIE blokuj dnia wyjazdu (end_date) - to dzień wyjazdu o 10:00
          const blockDates = [];
          let currentDate = new Date(startDate + 'T00:00:00');
          const endDateObj = new Date(endDate + 'T00:00:00');
          while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
            // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
            const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            blockDates.push(dateStr);
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          // Usuń tylko blokady z source 'reservation' z bazy danych
          for (const blockDate of blockDates) {
            try {
              await dbPool.query(
                'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
                [reservation.spot_id, blockDate, 'reservation']
              );
            } catch (error) {
              console.error(`❌ Błąd podczas usuwania blokady:`, error);
            }
          }
          
          // Wyślij email o anulowaniu
          await sendReservationCancellationEmail(reservation);
        }
      }
    }
    
    // KROK 2: Sprawdź rezerwacje "platnosc_w_toku" starsze niż 330 sekund od zmiany statusu (dokładnie 5 minut i 30 sekund)
    const [paymentInProgressExpired] = await dbPool.query(`
      SELECT id, spot_id, date, end_date, status, created_at, updated_at, payment_id,
             TIMESTAMPDIFF(SECOND, updated_at, NOW()) as seconds_old
      FROM reservations 
      WHERE status = 'platnosc_w_toku' 
      AND TIMESTAMPDIFF(SECOND, updated_at, NOW()) >= 330
    `);
    
    console.log('🔍 DEBUG PŁATNOŚĆ W TOKU - ZNALEZIONE WYGASŁE REZERWACJE (5min 30s):', paymentInProgressExpired.length);
    
    // Debug: pokaż szczegóły każdej rezerwacji "platnosc_w_toku"
    for (const res of paymentInProgressExpired) {
      console.log(`🔍 DEBUG PŁATNOŚĆ W TOKU - Rezerwacja ${res.id}:`);
      console.log('  created_at:', res.created_at);
      console.log('  updated_at:', res.updated_at);
      console.log('  seconds_old (od updated_at):', res.seconds_old);
      console.log('  payment_id:', res.payment_id);
    }
    
    if (paymentInProgressExpired.length > 0) {
      console.log(`🔍 DEBUG PŁATNOŚĆ W TOKU - Znaleziono ${paymentInProgressExpired.length} rezerwacji do sprawdzenia płatności (5min 30s)`);
      
      for (const reservation of paymentInProgressExpired) {
        console.log(`🔍 DEBUG PŁATNOŚĆ W TOKU - Sprawdzam płatność dla rezerwacji ${reservation.id}:`);
        console.log('  payment_id:', reservation.payment_id);
        console.log('  seconds_old (od updated_at):', reservation.seconds_old);
        
        let paymentStatus = 'nieoplacona'; // domyślnie nieopłacona
        
        // Dla rezerwacji starszych niż 330 sekund (5 minut i 30 sekund) od zmiany statusu - ustaw status "nieoplacona" (timer płatności już sprawdził płatności)
        paymentStatus = 'nieoplacona';
        
        // Zmień status na finalny status
        await dbPool.query(
          'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
          [paymentStatus, reservation.id]
        );
        
        // Jeśli status to "nieoplacona", usuń blokady
        if (paymentStatus === 'nieoplacona') {
          const startDate = formatDateForDisplay(reservation.date);
          const endDate = formatDateForDisplay(reservation.end_date);
          
          // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
          // NIE blokuj dnia wyjazdu (end_date) - to dzień wyjazdu o 10:00
          const blockDates = [];
          let currentDate = new Date(startDate + 'T00:00:00');
          const endDateObj = new Date(endDate + 'T00:00:00');
          while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
            // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
            const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            blockDates.push(dateStr);
            currentDate.setDate(currentDate.getDate() + 1);
          }
          
          // Usuń tylko blokady z source 'reservation' z bazy danych
          for (const blockDate of blockDates) {
            try {
              await dbPool.query(
                'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
                [reservation.spot_id, blockDate, 'reservation']
              );
            } catch (error) {
              console.error(`❌ Błąd podczas usuwania blokady:`, error);
            }
          }
        }
        
        // Wyślij email o anulowaniu jeśli status to "nieopłacona"
        if (paymentStatus === 'nieoplacona') {
          await sendReservationCancellationEmail(reservation);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania statusów rezerwacji:', error);
  }
}

// Funkcje do obsługi czasu polskiego - używamy dat bezpośrednio
function toPolishDate(dateString) {
  // Konwertuj datę z UTC na polską strefę czasową
  if (!dateString) return dateString;
  
  // Jeśli data jest już w formacie YYYY-MM-DD, zwróć bez zmian
  if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateString;
  }
  
  // Konwertuj z UTC na polską strefę czasową
  const date = new Date(dateString);
  const polishDate = new Date(date.getTime() + (2 * 60 * 60 * 1000)); // +2h dla Polski
  return polishDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
}

function fromPolishDate(dateString) {
  // Konwertuj datę z polskiej strefy czasowej na UTC
  if (!dateString) return dateString;
  
  // Jeśli data jest już w formacie YYYY-MM-DD, zwróć bez zmian
  if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateString;
  }
  
  // Konwertuj z polskiej strefy czasowej na UTC
  const date = new Date(dateString + 'T00:00:00+02:00'); // Polska strefa czasowa
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
}

// Funkcja do bezpiecznego parsowania dat z frontendu
function parseFrontendDate(dateString) {
  console.log('🔍 DEBUG parseFrontendDate - WEJŚCIE:', dateString, 'typ:', typeof dateString);
  
  if (!dateString) return null;
  
  // Jeśli data jest w formacie YYYY-MM-DD, traktuj jako lokalną datę
  if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Traktuj jako lokalną datę bez konwersji na UTC
    const result = dateString;
    console.log('🔍 DEBUG parseFrontendDate - WYNIK (YYYY-MM-DD):', result);
    return result;
  }
  
  // Dla innych formatów, użyj standardowej konwersji
  const date = new Date(dateString);
  const result = date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
  console.log('🔍 DEBUG parseFrontendDate - WYNIK (inny format):', result);
  return result;
}

// Funkcja do konwersji daty z bazy na format wyświetlany
function formatDateForDisplay(dateString) {
  console.log('🔍 DEBUG formatDateForDisplay - WEJŚCIE:', dateString, 'typ:', typeof dateString);
  
  if (!dateString) return '';
  
  const date = new Date(dateString);
  // Dodaj 2 godziny dla polskiej strefy czasowej
  const polishDate = new Date(date.getTime() + (2 * 60 * 60 * 1000));
  const result = polishDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
  
  console.log('🔍 DEBUG formatDateForDisplay - WYNIK:', result);
  return result;
}

// Funkcje do wysyłania emaili
async function sendReservationEmail(reservation) {
  try {
    const paymentUrl = `${DOMAIN_CONFIG.frontend}/rezerwacja/${reservation.token}`;
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const vatRate = 23;
    const amount = parseFloat(reservation.amount) || 0; // Konwersja na liczbę
    const vatAmount = (amount * vatRate / 100).toFixed(2);
    const netAmount = (amount - parseFloat(vatAmount)).toFixed(2);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">POTWIERDZENIE REZERWACJI</h2>
          <h3 style="color: #ffffff; margin: 10px 0 0 0; font-size: 18px; font-weight: normal;">Łowisko Młyn Rańsk</h3>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Szczegóły rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Telefon:</strong> ${reservation.phone}</p>
          <p><strong>Email:</strong> ${reservation.email}</p>
          <p><strong>Numer rejestracyjny:</strong> ${reservation.car_plate}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
        </div>
        
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Aby potwierdzić rezerwację:</h3>
          <p>Kliknij poniższy link, aby przejść do płatności:</p>
          <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
            Przejdź do płatności
          </a>
          <p style="margin-top: 15px; font-size: 14px; color: #1e3a8a;">
            <strong>WAŻNE:</strong> Masz 15 minut na rozpoczęcie płatności. Jeśli płatność nie przejdzie za pierwszym razem, możesz ponownie kliknąć opłać teraz i spróbować ponownie - dopóki nie minie 15 minut od utworzenia rezerwacji.
          </p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">Informacje fiskalne:</h3>
          <p><strong>Numer transakcji:</strong> ${transactionNumber}</p>
          <p><strong>Data transakcji:</strong> ${transactionDate}</p>
          <p><strong>Usługa:</strong> Rezerwacja stanowiska wędkarskiego nr ${reservation.spot_id}</p>
          <p><strong>Okres pobytu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')} - ${new Date(reservation.end_date).toLocaleDateString('pl-PL')} (${getDurationText(reservation.date, reservation.end_date)})</p>
          <p><strong>Kwota:</strong> ${amount.toFixed(2)} zł</p>
          <br>
          <p><strong>Dane sprzedawcy:</strong></p>
          <p>Artur Ropiak</p>
          <p>NIP: 7451275665</p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px; border: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 14px; margin: 0;">
            Jeśli link nie działa, skopiuj i wklej w przeglądarce: ${paymentUrl}
          </p>
        </div>
        
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px; border-left: 4px solid #ef4444;">
          <p style="color: #991b1b; font-size: 14px; margin: 0;">
            <strong>⚠️ UWAGA:</strong> Rezerwacja będzie ważna przez 15 minut. Po tym czasie zostanie automatycznie anulowana.
          </p>
        </div>
      </div>
    `;

    // Wysyłam email przez Resend
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Rezerwacja utworzona - czeka na płatność - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - rezerwacja utworzona dla:', reservation.email);
    
    console.log('Email z potwierdzeniem wysłany do:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila:', error);
  }
}

async function sendPaymentConfirmationEmail(reservation) {
  console.log(`DEBUG: Rozpoczynam wysyłanie emaila z potwierdzeniem płatności`);
  console.log(`DEBUG: Dane rezerwacji:`, reservation);
  try {
    const cancelUrl = `${DOMAIN_CONFIG.frontend}/rezerwacja/${reservation.token}`;
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const vatRate = 23;
    const amount = parseFloat(reservation.amount) || 0; // Konwersja na liczbę
    const vatAmount = (amount * vatRate / 100).toFixed(2);
    const netAmount = (amount - parseFloat(vatAmount)).toFixed(2);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">REZERWACJA POTWIERDZONA! 🎉</h2>
          <h3 style="color: #ffffff; margin: 10px 0 0 0; font-size: 18px; font-weight: normal;">Łowisko Młyn Rańsk</h3>
        </div>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #065f46; margin-top: 0; font-size: 18px;">Szczegóły potwierdzonej rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Telefon:</strong> ${reservation.phone}</p>
          <p><strong>Email:</strong> ${reservation.email}</p>
          <p><strong>Numer rejestracyjny:</strong> ${reservation.car_plate}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Kwota zapłacona:</strong> ${amount.toFixed(2)} PLN</p>
        </div>
        
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3 style="color: #856404; margin-top: 0;">Informacje fiskalne:</h3>
          <p><strong>Numer transakcji:</strong> ${transactionNumber}</p>
          <p><strong>Data transakcji:</strong> ${transactionDate}</p>
          <p><strong>Kategoria usługi:</strong> Usługi rekreacyjne i sportowe</p>
          <p><strong>Usługa:</strong> Rezerwacja stanowiska wędkarskiego nr ${reservation.spot_id}</p>
          <p><strong>Okres pobytu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')} - ${new Date(reservation.end_date).toLocaleDateString('pl-PL')} (${getDurationText(reservation.date, reservation.end_date)})</p>
          <p><strong>Kwota:</strong> ${amount.toFixed(2)} zł</p>
          <br>
          <p><strong>Dane sprzedawcy:</strong></p>
          <p>Artur Ropiak</p>
          <p>NIP: 7451275665</p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Ważne informacje:</h3>
          <ul style="color: #374151; line-height: 1.6;">
            <li>Check-in: 11:00</li>
            <li>Check-out: 10:00 ostatniego dnia</li>
            <li>Zabierz ze sobą dokument tożsamości</li>
            <li>Pamiętaj o sprzęcie wędkarskim</li>
          </ul>
        </div>
        
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Możliwość anulowania:</h3>
          <p>Możesz anulować rezerwację do 3 dni roboczych przed przyjazdem.</p>
          <a href="${cancelUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
            Anuluj rezerwację
          </a>
          <p style="margin-top: 15px; font-size: 14px; color: #1e3a8a;">
            <strong>WAŻNE:</strong> Po kliknięciu linku będziesz mógł zgłosić anulowanie rezerwacji. Zwrot środków zostanie zrealizowany w ciągu 7 dni roboczych.
          </p>
        </div>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px; text-align: center; border: 2px solid #10b981;">
          <p style="color: #065f46; font-size: 16px; margin: 0; font-weight: bold;">
            Dziękujemy za wybór Łowiska Młyn Rańsk! 🎣
          </p>
        </div>
      </div>
    `;

    console.log(`DEBUG: Wysyłam email przez Resend do: ${reservation.email}`);
    // Wysyłam email przez Resend
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Rezerwacja potwierdzona - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - potwierdzenie płatności dla:', reservation.email);
    console.log('Email z potwierdzeniem płatności wysłany do:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila z potwierdzeniem płatności:', error);
  }
}

async function sendReservationCancellationEmail(reservation) {
  console.log(`DEBUG: Rozpoczynam wysyłanie emaila o anulowaniu rezerwacji`);
  console.log(`DEBUG: Dane rezerwacji:`, reservation);
  try {
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const vatRate = 23;
    const amount = parseFloat(reservation.amount) || 0; // Konwersja na liczbę
    const vatAmount = (amount * vatRate / 100).toFixed(2);
    const netAmount = (amount - parseFloat(vatAmount)).toFixed(2);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">REZERWACJA ANULOWANA</h2>
          <h3 style="color: #ffffff; margin: 10px 0 0 0; font-size: 18px; font-weight: normal;">Łowisko Młyn Rańsk</h3>
        </div>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #ef4444;">
          <h3 style="color: #991b1b; margin-top: 0; font-size: 18px;">Szczegóły anulowanej rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Telefon:</strong> ${reservation.phone}</p>
          <p><strong>Email:</strong> ${reservation.email}</p>
          <p><strong>Numer rejestracyjny:</strong> ${reservation.car_plate}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Kwota rezerwacji:</strong> ${amount.toFixed(2)} PLN</p>
        </div>
        
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3 style="color: #856404; margin-top: 0;">Informacje fiskalne:</h3>
          <p><strong>Numer transakcji:</strong> ${transactionNumber}</p>
          <p><strong>Data transakcji:</strong> ${transactionDate}</p>
          <p><strong>Kategoria usługi:</strong> Usługi rekreacyjne i sportowe</p>
          <p><strong>Usługa:</strong> Rezerwacja stanowiska wędkarskiego nr ${reservation.spot_id}</p>
          <p><strong>Okres pobytu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')} - ${new Date(reservation.end_date).toLocaleDateString('pl-PL')} (${getDurationText(reservation.date, reservation.end_date)})</p>
          <p><strong>Kwota:</strong> ${amount.toFixed(2)} zł</p>
          <br>
          <p><strong>Dane sprzedawcy:</strong></p>
          <p>Artur Ropiak</p>
          <p>NIP: 7451275665</p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Powód anulowania:</h3>
          <p>Rezerwacja została automatycznie anulowana z powodu braku płatności w terminie 15 minut od utworzenia.</p>
          <p>Termin został zwolniony i jest ponownie dostępny dla innych klientów.</p>
        </div>
        
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Chcesz zarezerwować ponownie?</h3>
          <p>Możesz utworzyć nową rezerwację na naszej stronie internetowej.</p>
          <a href="${DOMAIN_CONFIG.frontend}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
            Zarezerwuj ponownie
          </a>
        </div>
        
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px; text-align: center; border: 2px solid #ef4444;">
          <p style="color: #991b1b; font-size: 16px; margin: 0; font-weight: bold;">
            Dziękujemy za zainteresowanie Łowiskiem Młyn Rańsk! 🎣
          </p>
        </div>
      </div>
    `;

    console.log(`DEBUG: Wysyłam email przez Resend do: ${reservation.email}`);
    // Wysyłam email przez Resend
    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Rezerwacja anulowana - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - anulowanie rezerwacji dla:', reservation.email);
    console.log('Email o anulowaniu rezerwacji wysłany do:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila o anulowaniu rezerwacji:', error);
  }
}

// Nowe funkcje email dla nowych statusów
async function sendRefundRequestedEmail(reservation) {
  try {
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const amount = parseFloat(reservation.amount) || 0;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f39c12;">ZWROT ZGŁOSZONY</h2>
        <h3 style="color: #34495e;">Łowisko Młyn Rańsk</h3>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">Szczegóły rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Kwota:</strong> ${amount.toFixed(2)} PLN</p>
        </div>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #065f46; margin-top: 0; font-size: 18px;">Status zwrotu:</h3>
          <p>Twój wniosek o zwrot został przyjęty do systemu. Administrator zrealizuje zwrot w ciągu kilku dni roboczych.</p>
          <p><strong>Numer rezerwacji:</strong> ${reservation.id}</p>
          <p><strong>Data zgłoszenia zwrotu:</strong> ${transactionDate}</p>
        </div>
        
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Sprawdź status rezerwacji:</h3>
          <a href="${DOMAIN_CONFIG.frontend}/rezerwacja/${reservation.token}" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
            Sprawdź status rezerwacji
          </a>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Kontakt:</h3>
          <p>W razie pytań prosimy o kontakt:</p>
          <p>Email: kontakt@lowisko-ransk.pl</p>
          <p>Telefon: 698 624 869</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            <strong>Dane sprzedawcy:</strong><br>
            Artur Ropiak<br>
            NIP: 7451275665
          </p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Zwrot zgłoszony - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - zwrot zgłoszony dla:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila o zgłoszonym zwrocie:', error);
  }
}

async function sendAdminCancellationEmail(reservation) {
  try {
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const amount = parseFloat(reservation.amount) || 0;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">REZERWACJA ANULOWANA PRZEZ ADMINISTRATORA</h2>
        <h3 style="color: #34495e;">Łowisko Młyn Rańsk</h3>
        
        <div style="background-color: #fdf2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #e74c3c; margin-top: 0;">Szczegóły anulowanej rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Kwota:</strong> ${amount.toFixed(2)} PLN</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">Przepraszamy za anulację:</h3>
          <p>Niestety stanowisko jest niedostępne w tym terminie z przyczyn technicznych. Zwrot środków zostanie zrealizowany automatycznie.</p>
          <p><strong>Numer rezerwacji:</strong> ${reservation.id}</p>
          <p><strong>Data anulowania:</strong> ${transactionDate}</p>
        </div>
        
        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1976d2; margin-top: 0;">Sprawdź status rezerwacji:</h3>
          <a href="${DOMAIN_CONFIG.frontend}/rezerwacja/${reservation.token}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Sprawdź status rezerwacji
          </a>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Kontakt:</h3>
          <p>W razie pytań prosimy o kontakt:</p>
          <p>Email: kontakt@lowisko-ransk.pl</p>
          <p>Telefon: 698 624 869</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            <strong>Dane sprzedawcy:</strong><br>
            Artur Ropiak<br>
            NIP: 7451275665
          </p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Rezerwacja anulowana przez administratora - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - anulowanie przez admina dla:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila o anulowaniu przez admina:', error);
  }
}

async function sendRefundCompletedEmail(reservation) {
  try {
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const amount = parseFloat(reservation.amount) || 0;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #27ae60;">ZWROT ZREALIZOWANY</h2>
        <h3 style="color: #34495e;">Łowisko Młyn Rańsk</h3>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #065f46; margin-top: 0; font-size: 18px;">Szczegóły zwróconej rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Kwota zwrócona:</strong> ${amount.toFixed(2)} PLN</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">Status zwrotu:</h3>
          <p>Administrator zrealizował zwrot w systemie. Środki są w drodze i dotrą do Ciebie w ciągu kilku dni roboczych.</p>
          <p><strong>Numer rezerwacji:</strong> ${reservation.id}</p>
          <p><strong>Data realizacji zwrotu:</strong> ${transactionDate}</p>
        </div>
        
        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1976d2; margin-top: 0;">Sprawdź status rezerwacji:</h3>
          <a href="${DOMAIN_CONFIG.frontend}/rezerwacja/${reservation.token}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Sprawdź status rezerwacji
          </a>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Kontakt:</h3>
          <p>W razie pytań prosimy o kontakt:</p>
          <p>Email: kontakt@lowisko-ransk.pl</p>
          <p>Telefon: 698 624 869</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            <strong>Dane sprzedawcy:</strong><br>
            Artur Ropiak<br>
            NIP: 7451275665
          </p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Zwrot zrealizowany - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - zwrot zrealizowany dla:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila o zrealizowanym zwrocie:', error);
  }
}

async function sendAdminRefundCompletedEmail(reservation) {
  try {
    const transactionDate = new Date().toLocaleString('pl-PL');
    const transactionNumber = `TR-${new Date().getFullYear()}-${String(reservation.id).padStart(3, '0')}`;
    const amount = parseFloat(reservation.amount) || 0;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #27ae60;">ZWROT PO ANULACJI ZREALIZOWANY</h2>
        <h3 style="color: #34495e;">Łowisko Młyn Rańsk</h3>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #065f46; margin-top: 0; font-size: 18px;">Szczegóły anulowanej i zwróconej rezerwacji:</h3>
          <p><strong>Imię i nazwisko:</strong> ${reservation.first_name} ${reservation.last_name}</p>
          <p><strong>Stanowisko:</strong> ${reservation.spot_id}</p>
          <p><strong>Data przyjazdu:</strong> ${new Date(reservation.date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Data wyjazdu:</strong> ${new Date(reservation.end_date).toLocaleDateString('pl-PL')}</p>
          <p><strong>Kwota zwrócona:</strong> ${amount.toFixed(2)} PLN</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">Status zwrotu:</h3>
          <p>Zwrot po anulacji rezerwacji został zrealizowany. Środki są w drodze i dotrą do Ciebie w ciągu kilku dni roboczych.</p>
          <p><strong>Numer rezerwacji:</strong> ${reservation.id}</p>
          <p><strong>Data realizacji zwrotu:</strong> ${transactionDate}</p>
        </div>
        
        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1976d2; margin-top: 0;">Sprawdź status rezerwacji:</h3>
          <a href="${DOMAIN_CONFIG.frontend}/rezerwacja/${reservation.token}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Sprawdź status rezerwacji
          </a>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Kontakt:</h3>
          <p>W razie pytań prosimy o kontakt:</p>
          <p>Email: kontakt@lowisko-ransk.pl</p>
          <p>Telefon: 698 624 869</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px; border-left: 4px solid #f59e0b;">
          <p style="color: #92400e; font-size: 14px; margin: 0;">
            <strong>Dane sprzedawcy:</strong><br>
            Artur Ropiak<br>
            NIP: 7451275665
          </p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: reservation.email,
      subject: 'Zwrot po anulacji zrealizowany - Łowisko Młyn Rańsk',
      html: html
    });
    
    console.log('📧 Email wysłany - zwrot po anulacji zrealizowany dla:', reservation.email);
  } catch (error) {
    console.error('Błąd podczas wysyłania emaila o zrealizowanym zwrocie po anulacji:', error);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// Konfiguracja CORS - pozwól na żądania z frontendu (również www i lokalne)
const allowedOrigins = [
  DOMAIN_CONFIG.frontend,
  DOMAIN_CONFIG.backend,
  'https://lowiskomlynransk.pl',
  'https://www.lowiskomlynransk.pl',
  'http://lowiskomlynransk.pl',
  'http://www.lowiskomlynransk.pl',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // pozwól na brak origin (np. mobilne webview)
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('CORS: zablokowano origin:', origin);
    return callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept'],
  optionsSuccessStatus: 200
}));

// Dodaj middleware do obsługi preflight requests
app.options('*', cors());

// Dodaj middleware do logowania żądań (debug dla Render)
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  console.log(`   Origin: ${req.headers.origin}`);
  console.log(`   User-Agent: ${req.headers['user-agent']}`);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Połączenie z bazą MySQL (lokalna lub Render)
console.log('🔍 DEBUG - Zmienne środowiskowe:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('NODE_ENV:', process.env.NODE_ENV);

let pool;

// Funkcja do tworzenia puli połączeń z lepszą obsługą błędów
function createDatabasePool() {
try {
    return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Jankopernik1',
    database: process.env.DB_NAME || 'fishing',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
      timezone: '+02:00',
      // Usunięto nieobsługiwane: acquireTimeout, timeout, reconnect
      // Zamiast tego ustawiamy connectTimeout
      connectTimeout: 60000,
      charset: 'utf8mb4'
    });
  } catch (error) {
    console.error('❌ Błąd podczas tworzenia puli połączeń:', error.message);
    return null;
  }
}

// Inicjalizacja puli
pool = createDatabasePool();

  // Test połączenia z bazą danych (nie blokuj uruchamiania serwera)
if (pool) {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('❌ Błąd połączenia z bazą danych:', err.message);
      console.error('   Sprawdź zmienne środowiskowe DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
      console.error('   Serwer uruchomi się bez bazy danych - niektóre funkcje mogą nie działać');
    } else {
      console.log('✅ Połączenie z bazą danych udane');
      connection.release();
    }
  });
} else {
  console.error('❌ Nie udało się utworzyć puli połączeń');
  console.error('   Serwer uruchomi się bez bazy danych - niektóre funkcje mogą nie działać');
}

// Funkcja pomocnicza do sprawdzania dostępności bazy danych z retry logic
async function checkDatabaseConnection() {
  if (!pool) {
    throw new Error('Baza danych niedostępna');
  }
  
  // Sprawdź czy połączenie jest aktywne
  try {
    const connection = await pool.getConnection();
    connection.release();
  return pool;
  } catch (error) {
    console.error('❌ Błąd połączenia z bazą danych:', error.message);
    
    // Jeśli to błąd ECONNRESET, spróbuj ponownie utworzyć pulę
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      console.log('🔄 Próba ponownego połączenia z bazą danych...');
      pool = createDatabasePool();
      
      if (pool) {
        try {
          const connection = await pool.getConnection();
          connection.release();
          console.log('✅ Ponowne połączenie z bazą danych udane');
          return pool;
        } catch (retryError) {
          console.error('❌ Nie udało się ponownie połączyć z bazą danych:', retryError.message);
          throw new Error('Baza danych niedostępna po próbie ponownego połączenia');
        }
      } else {
        throw new Error('Nie udało się utworzyć nowej puli połączeń');
      }
    }
    
    throw error;
  }
}

// GET /api/spots – lista wszystkich stanowisk
app.get('/api/spots', async (req, res) => {
  try {
    const dbPool = await checkDatabaseConnection();
    const [rows] = await dbPool.query('SELECT * FROM spots');
    res.json(rows);
  } catch (err) {
    console.error('❌ Błąd w /api/spots:', err.message);
    res.status(503).json({ error: err.message });
  }
});

// GET /api/reservations – lista wszystkich rezerwacji
app.get('/api/reservations', async (req, res) => {
  try {
    const dbPool = await checkDatabaseConnection();
    const [rows] = await dbPool.query('SELECT * FROM reservations ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('❌ Błąd w /api/reservations:', err.message);
    res.status(503).json({ error: err.message });
  }
});

// Zwraca aktualny czas serwera/DB do synchronizacji zegara na froncie
app.get('/api/reservations/time', async (req, res) => {
  try {
    const dbPool = await checkDatabaseConnection();
    if (dbPool) {
      try {
        const [rows] = await dbPool.query('SELECT (UNIX_TIMESTAMP(NOW(3)) * 1000) AS now_ms');
        const nowMs = Math.round(rows[0]?.now_ms ?? Date.now());
        return res.json({ serverNowMs: nowMs });
      } catch (dbErr) {
        // Fallback do czasu procesu
        return res.json({ serverNowMs: Date.now() });
      }
    }
    // Jeśli brak połączenia z DB, zwróć czas procesu serwera
    return res.json({ serverNowMs: Date.now() });
  } catch (err) {
    return res.json({ serverNowMs: Date.now() });
  }
});

// GET /api/reservations/token/:token – pobierz rezerwację po tokenie i sprawdź status płatności
app.get('/api/reservations/token/:token', async (req, res) => {
  const token = req.params.token;
  console.log('🔍 Endpoint /api/reservations/token/:token wywołany dla tokenu:', token);
  
  try {
    const dbPool = await checkDatabaseConnection();
    const [rows] = await dbPool.query('SELECT * FROM reservations WHERE token = ?', [token]);
    if (rows.length === 0) {
      console.log('❌ Nie znaleziono rezerwacji dla tokenu:', token);
      return res.status(404).json({ error: 'Rezerwacja nie została znaleziona' });
    }
    
    const reservation = rows[0];
    console.log('✅ Znaleziono rezerwację:', reservation.id, 'status:', reservation.status, 'payment_id:', reservation.payment_id);
    
    // Sprawdź czy rezerwacja ma payment_id (czy była próba płatności)
    // ZMIANA: Sprawdzaj status płatności dla WSZYSTKICH rezerwacji z payment_id, nie tylko 'oczekująca' i 'platnosc_w_toku'
    if (reservation.payment_id) {
      console.log('💰 Rezerwacja ma payment_id:', reservation.payment_id);
      console.log('🔍 Sprawdzam status płatności w Przelewy24...');
      
      // Sprawdź status płatności w Przelewy24 (dla sandboxa)
      try {
        const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
        
        // Użyj sessionId do sprawdzania statusu (prawidłowy endpoint)
        const sessionId = reservation.payment_id;
        console.log('🔧 Używam sessionId:', sessionId);
        console.log('🌐 Wysyłam żądanie do Przelewy24:', `${P24_CONFIG.baseUrl}/transaction/by/sessionId/${sessionId}`);
        const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/by/sessionId/${sessionId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
          }
        });
        
        console.log('📡 Status odpowiedzi z Przelewy24:', response.status);
        if (response.status === 200) {
          const paymentData = await response.json();
          console.log('📊 Status płatności z Przelewy24:', JSON.stringify(paymentData, null, 2));
          
          // Sprawdź czy płatność została zrealizowana
          // Status 1 = udana płatność, Status 0 = oczekująca
          if (paymentData.data && paymentData.data.status === 1) { // 1 = udana płatność
            console.log('✅ Płatność potwierdzona przez status=1 – weryfikuję kwotę i transakcję');

            // Utwardzenie: sprawdź zgodność kwoty i wykonaj verify
            const expectedAmount = Math.round(Number(reservation.amount || 0) * 100);
            const reportedAmount = Number(
              (paymentData?.data?.amount ?? paymentData?.data?.originAmount ?? NaN)
            );
            const orderIdCandidate = paymentData?.data?.orderId ?? paymentData?.data?.order_id ?? null;

            let verified = false;
            if (Number.isFinite(reportedAmount) && reportedAmount === expectedAmount && orderIdCandidate) {
              try {
                const verificationResult = await verifyTransaction(
                  reservation.payment_id,
                  orderIdCandidate,
                  expectedAmount,
                  paymentData?.data?.currency || 'PLN'
                );
                verified = verificationResult?.data?.status === 'success';
              } catch (e) {
                console.error('❌ Błąd verifyTransaction (token endpoint):', e);
              }
            } else {
              console.warn('⚠️ Brak zgodnej kwoty lub orderId – nie ustawiam "opłacona" (token endpoint).', { expectedAmount, reportedAmount, hasOrderId: !!orderIdCandidate });
            }

            if (verified) {
              // Zmień status na "opłacona" (tylko jeśli nie jest już opłacona)
              if (reservation.status !== 'opłacona') {
                await dbPool.query('UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?', ['opłacona', reservation.id]);
                
                // Zmień source blokad z 'reservation' na 'paid_reservation' (rezerwacja potwierdzona)
                const startDate = formatDateForDisplay(reservation.date);
                const endDate = formatDateForDisplay(reservation.end_date);
                
                // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
                // NIE blokuj dnia wyjazdu (end_date) - to dzień wyjazdu o 10:00
                const blockDates = [];
                let currentDate = new Date(startDate + 'T00:00:00');
                const endDateObj = new Date(endDate + 'T00:00:00');
                while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
                  // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
                  const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  blockDates.push(dateStr);
                  currentDate.setDate(currentDate.getDate() + 1);
                }
                
                // Usuń stare blokady z source 'reservation' i dodaj nowe z source 'paid_reservation'
                for (const blockDate of blockDates) {
                  try {
                    // Usuń starą blokadę
                    await dbPool.query(
                      'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
                      [reservation.spot_id, blockDate, 'reservation']
                    );
                    
                    // Dodaj nową blokadę z source 'paid_reservation'
                    await dbPool.query(
                      'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
                      [reservation.spot_id, blockDate, 'paid_reservation']
                    );
                  } catch (error) {
                    console.error(`❌ Błąd podczas zmiany source blokady:`, error);
                  }
                }
                
                // Wyślij email z potwierdzeniem
                await sendPaymentConfirmationEmail(reservation);
              }
              
              // Pobierz zaktualizowaną rezerwację
              const [updatedRows] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [reservation.id]);
              console.log('✅ Zwracam zaktualizowaną rezerwację ze statusem "opłacona"');
              return res.json(updatedRows[0]);
            }
          } else {
            // Jeśli Przelewy24 zwraca status 0 – transakcja nie została zrealizowana (np. anulowana)
            if (paymentData.data && paymentData.data.status === 0) {
              console.log('❌ Płatność nieudana/anulowana (status 0) – zwracam redirect na stronę błędu.');
              const errorResponse = {
                ...reservation,
                paymentError: true,
                redirectTo: `/rezerwacja-error/${reservation.token}?fromPayment=true`
              };
              return res.json(errorResponse);
            }

            // Dla rezerwacji w statusie "platnosc_w_toku" - jeśli płatność nie została potwierdzona, przekieruj na stronę błędu
            if (reservation.status === 'platnosc_w_toku') {
              console.log('❌ Rezerwacja w statusie "platnosc_w_toku" - płatność nie została potwierdzona, przekierowuję na stronę błędu.');
              const errorResponse = {
                ...reservation,
                paymentError: true,
                redirectTo: `/rezerwacja-error/${reservation.token}?fromPayment=true`
              };
              return res.json(errorResponse);
            }

            // Inne stany – nie traktuj automatycznie jako błąd (może być w toku). Zwróć rezerwację bez redirectu.
            console.log('ℹ️ Płatność nie jest potwierdzona i nie jest status 0 (wartość:', paymentData.data?.status, '). Zwracam rezerwację bez redirectu.');
            return res.json(reservation);
          }
        } else {
          console.log('❌ Nie udało się sprawdzić statusu płatności (status:', response.status, ')');
          const errorData = await response.text();
          console.log('Błąd z Przelewy24:', errorData);
          
          // Dla rezerwacji w statusie "platnosc_w_toku" - jeśli nie udało się sprawdzić statusu płatności, przekieruj na stronę błędu
          if (reservation.status === 'platnosc_w_toku') {
            console.log('❌ Rezerwacja w statusie "platnosc_w_toku" - błąd sprawdzania statusu płatności, przekierowuję na stronę błędu.');
            const errorResponse = {
              ...reservation,
              paymentError: true,
              redirectTo: `/rezerwacja-error/${reservation.token}?fromPayment=true`
            };
            return res.json(errorResponse);
          }
          
          // Nie przekierowuj – zwróć bieżącą rezerwację i pozwól frontendowi kontynuować polling/status.
          console.log('ℹ️ Zwracam rezerwację bez redirectu po błędzie sprawdzania statusu.');
          return res.json(reservation);
        }
      } catch (error) {
        console.error('❌ Błąd podczas sprawdzania statusu płatności:', error);
        
        // Dla rezerwacji w statusie "platnosc_w_toku" - jeśli wystąpił błąd podczas sprawdzania statusu płatności, przekieruj na stronę błędu
        if (reservation.status === 'platnosc_w_toku') {
          console.log('❌ Rezerwacja w statusie "platnosc_w_toku" - błąd podczas sprawdzania statusu płatności, przekierowuję na stronę błędu.');
          const errorResponse = {
            ...reservation,
            paymentError: true,
            redirectTo: `/rezerwacja-error/${reservation.token}?fromPayment=true`
          };
          return res.json(errorResponse);
        }
        
        // Nie przekierowuj – zwróć bieżącą rezerwację i pozwól frontendowi kontynuować polling/status.
        console.log('ℹ️ Zwracam rezerwację bez redirectu po wyjątku podczas sprawdzania statusu.');
        return res.json(reservation);
      }
    } else {
      console.log('❌ Rezerwacja nie ma payment_id - nie sprawdzam statusu płatności');
    }
    
    console.log('✅ Zwracam rezerwację bez zmian');
    res.json(reservation);
  } catch (err) {
    console.error('❌ Błąd podczas pobierania rezerwacji:', err);
    res.status(500).json({ error: err.message });
  }
});

// Funkcja weryfikacji reCAPTCHA
async function verifyCaptcha(token) {
  try {
    const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY || '6Lcd3JYrAAAAAKUPrPnZrVbi2t3WZDht9PLCAAhY', // Replace with your actual secret key
        response: token
      }
    });
    
    console.log('🔍 DEBUG CAPTCHA - ODPOWIEDŹ GOOGLE:');
    console.log('response.data:', response.data);
    
    return response.data.success;
  } catch (error) {
    console.error('❌ Błąd weryfikacji captcha:', error);
    return false;
  }
}

// POST /api/reservations – utworzenie nowej rezerwacji
app.post('/api/reservations', async (req, res) => {
  console.log('🔍 DEBUG REZERWACJA - DANE WEJŚCIOWE:');
  console.log('req.body:', req.body);
  
  const {
    first_name, last_name, phone, car_plate, email,
    spot_id, date, start_time, end_date, end_time, amount, captcha_token // <-- dodane captcha_token
  } = req.body;
  
  // Weryfikacja captcha WŁĄCZONA
  if (!captcha_token) {
    return res.status(400).json({ error: 'Brak tokenu captcha.' });
  }
  const captchaValid = await verifyCaptcha(captcha_token);
  if (!captchaValid) {
    return res.status(400).json({ error: 'Weryfikacja captcha nie powiodła się. Spróbuj ponownie.' });
  }
  
  // DEBUG: Sprawdź dokładnie jakie daty przychodzą z frontendu
  console.log('🔍 DEBUG REZERWACJA - DATY Z FRONTENDU:');
  console.log('date (przyjazd):', date, 'typ:', typeof date);
  console.log('end_date (wyjazd):', end_date, 'typ:', typeof end_date);
  console.log('Sprawdzenie wymaganych pól:', {
    first_name: !!first_name,
    last_name: !!last_name,
    phone: !!phone,
    car_plate: !!car_plate,
    email: !!email,
    spot_id: !!spot_id,
    date: !!date,
    start_time: !!start_time,
    end_date: !!end_date,
    captcha_token: !!captcha_token
  });
  if (!first_name || !last_name || !phone || !car_plate || !email || !spot_id || !date || !start_time || !end_date) {
    return res.status(400).json({ error: 'Brak wymaganych danych.' });
  }
  const token = uuidv4();
  const status = 'oczekująca';
  // Pozwól MySQL ustawić created_at automatycznie (CURRENT_TIMESTAMP)
  // Nie ustawiamy created_at ręcznie, żeby uniknąć problemów ze strefami czasowymi
  const final_end_time = end_time || '10:00:00';

  // Naprawione przetwarzanie dat - konwertuj z lokalnej strefy czasowej na UTC
  const dateFixed = parseFrontendDate(date);
  const endDateFixed = parseFrontendDate(end_date);
  
  console.log('🔍 DEBUG REZERWACJA - DATY PO KONWERSJI:');
  console.log('dateFixed (UTC):', dateFixed);
  console.log('endDateFixed (UTC):', endDateFixed);

  // Obliczanie liczby dób hotelowych (11:00-10:00 następnego dnia)
  function parseYMD(str) {
    // str: '2025-07-27' → { y: 2025, m: 7, d: 27 }
    const [y, m, d] = str.split('-').map(Number);
    return { y, m, d };
  }
  
  const s = parseYMD(dateFixed);
  const e = parseYMD(endDateFixed);
  const start = new Date(s.y, s.m - 1, s.d);
  const end = new Date(e.y, e.m - 1, e.d);
  
  console.log('🔍 DEBUG REZERWACJA - OBLICZENIA:');
  console.log('start:', start, 'end:', end);
  console.log('start.getTime():', start.getTime(), 'end.getTime():', end.getTime());
  console.log('różnica ms:', end.getTime() - start.getTime());
  
  // Obliczanie liczby dób hotelowych
  // Doba hotelowa: od 11:00 do 10:00 następnego dnia
  // Przy rezerwacji kilku dni: koniec doby (10:00) obowiązuje tylko na ostatnim dniu
  const msPerDay = 1000 * 60 * 60 * 24;
  let numDays = Math.floor((end.getTime() - start.getTime()) / msPerDay);
  
  // Jeśli to ten sam dzień, to 1 doba
  if (numDays === 0) {
    numDays = 1;
  }
  // Jeśli różne dni, to liczba dni = różnica dni (bez dodawania 1)
  // Przykład: 5-7 sierpnia = 2 doby (5-6 sierpnia)
  
  console.log('🔍 DEBUG REZERWACJA - WYNIKI:');
  console.log('date:', dateFixed, 'end_date:', endDateFixed);
  console.log('numDays:', numDays);
  let final_amount = amount;
  if (final_amount === undefined || final_amount === null) {
    final_amount = numDays * 70;
  }

  try {
    // DEBUG: Sprawdź co dokładnie jest wysyłane do bazy
    console.log('🔍 DEBUG REZERWACJA - WYSYŁANIE DO BAZY:');
    console.log('date (przyjazd):', dateFixed);
    console.log('end_date (wyjazd):', endDateFixed);
    
    const dbPool = await checkDatabaseConnection();
    const [result] = await dbPool.query(
      `INSERT INTO reservations (first_name, last_name, phone, car_plate, email, spot_id, date, start_time, end_date, end_time, status, token, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, phone, car_plate, email, spot_id, dateFixed, start_time, endDateFixed, final_end_time, status, token, final_amount]
    );
    
    // Pobierz utworzoną rezerwację do wysłania emaila
    const [newReservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [result.insertId]);
    
    // DEBUG: Sprawdź co zostało zapisane w bazie
    console.log('🔍 DEBUG REZERWACJA - DANE W BAZIE:');
    console.log('reservation.date:', newReservation[0].date);
    console.log('reservation.end_date:', newReservation[0].end_date);
    
    // Dodaj blokady dla wszystkich dni rezerwacji (tylko dla statusu "oczekująca")
    const reservation = newReservation[0];
    
    // Użyj dat z bazy i konwertuj na lokalną strefę czasową dla blokad
    const startDateStr = formatDateForDisplay(reservation.date);
    const endDateStr = formatDateForDisplay(reservation.end_date);
    
    console.log('🔍 DEBUG REZERWACJA - TWORZENIE BLOKAD:');
    console.log('🔒 Tworzę blokady dla rezerwacji (status: oczekująca):', {
      id: result.insertId,
      spot_id: spot_id,
      startDate: startDateStr,
      endDate: endDateStr
    });
    
    // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
    const blockDates = [];
    let currentDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');
    while (currentDate < endDate) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
      // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
      const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      blockDates.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log('🔍 DEBUG REZERWACJA - DNI DO ZABLOKOWANIA:');
    console.log('🔒 Dni do zablokowania:', blockDates);
    
    // Dodaj blokady do bazy danych (tylko dla rezerwacji "oczekująca")
    for (const blockDate of blockDates) {
      try {
        await dbPool.query(
          'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
          [spot_id, blockDate, 'reservation']
        );
        console.log(`✅ Dodano blokadę: stanowisko ${spot_id}, data ${blockDate}, source: reservation`);
      } catch (error) {
        console.error(`❌ Błąd podczas dodawania blokady:`, error);
      }
    }
    
    console.log(`🔒 Dodano ${blockDates.length} blokad dla rezerwacji ${result.insertId} (dni: ${blockDates.join(', ')})`);
    
    // Wyślij email z potwierdzeniem rezerwacji
    await sendReservationEmail(newReservation[0]);
    
    res.json({ id: result.insertId, token, status, amount: final_amount });
  } catch (err) {
    console.error('❌ Błąd przy dodawaniu rezerwacji:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- BLOKADY STANOWISK ---
// GET blokady dla stanowiska
app.get('/api/spots/:id/blocks', async (req, res) => {
  const spotId = req.params.id;
  try {
    console.log('DEBUG: Pobieranie blokad dla stanowiska:', spotId);
    const dbPool = await checkDatabaseConnection();
    const [blocks] = await dbPool.query('SELECT date FROM spot_blocks WHERE spot_id = ?', [spotId]);
    console.log('DEBUG: Znalezione blokady (wszystkie source):', blocks);
    res.json(blocks);
  } catch (err) {
    console.error('DEBUG: Błąd podczas pobierania blokad:', err);
    res.status(500).json({ error: err.message });
  }
});
// POST dodaj blokadę
app.post('/api/spots/:id/blocks', async (req, res) => {
  const spotId = req.params.id;
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Brak wymaganych danych.' });
  }
  try {
    console.log('DEBUG: Dodawanie blokady - stanowisko:', spotId, 'data:', date);
    const dbPool = await checkDatabaseConnection();
    await dbPool.query('INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)', [spotId, date, 'admin']);
    console.log('DEBUG: Blokada dodana pomyślnie');
    res.json({ success: true });
  } catch (err) {
    console.error('DEBUG: Błąd podczas dodawania blokady:', err);
    res.status(500).json({ error: err.message });
  }
});
// DELETE usuń blokadę
app.delete('/api/spots/:id/blocks', async (req, res) => {
  const spotId = req.params.id;
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Brak wymaganych danych.' });
  }
  try {
    console.log('DEBUG: Usuwanie blokady - stanowisko:', spotId, 'data:', date);
    const dbPool = await checkDatabaseConnection();
    const [result] = await dbPool.query('DELETE FROM spot_blocks WHERE spot_id = ? AND date = ?', [spotId, date]);
    console.log('DEBUG: Usunięto blokad (wszystkie source):', result.affectedRows);
    res.json({ success: true });
  } catch (err) {
    console.error('DEBUG: Błąd podczas usuwania blokady:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- WOLNE STANOWISKA NA TERMIN ---
// GET /api/available-spots?date=YYYY-MM-DD&start_time=HH:MM&duration=N
app.get('/api/available-spots', async (req, res) => {
  const { date, start_time, duration } = req.query;
  if (!date || !start_time || !duration) {
    return res.status(400).json({ error: 'Brak wymaganych parametrów.' });
  }
  const startHour = parseInt(String(start_time).split(':')[0], 10);
  const dur = parseInt(duration, 10);
  try {
    const dbPool = await checkDatabaseConnection();
    
    // Pobierz wszystkie stanowiska
    const [spots] = await dbPool.query('SELECT * FROM spots WHERE is_active = 1');
    
    // Pobierz rezerwacje na ten dzień (tylko opłacone i oczekujące)
    const [reservations] = await dbPool.query(`
      SELECT spot_id, start_time, end_time, status, created_at 
      FROM reservations 
      WHERE date = ? AND status IN ('opłacona', 'oczekująca')
    `, [date]);
    
    // Pobierz blokady na ten dzień (całe dni są zablokowane) - wszystkie source
    const [blocks] = await dbPool.query('SELECT spot_id FROM spot_blocks WHERE date = ?', [date]);
    
    // Sprawdź dostępność każdego stanowiska
    const available = spots.filter(spot => {
      // Sprawdź czy stanowisko jest zablokowane na cały dzień
      const isBlocked = blocks.some(b => b.spot_id === spot.id);
      if (isBlocked) return false;
      
      // Sprawdź rezerwacje
      const resForSpot = reservations.filter(r => r.spot_id === spot.id);
      for (const r of resForSpot) {
        // Dla rezerwacji "oczekująca" sprawdź czy nie minęło 15 minut
        if (r.status === 'oczekująca') {
          const created = new Date(r.created_at);
          const now = new Date();
          const elapsed = Math.floor((now.getTime() - created.getTime()) / 1000);
          const totalTime = 15 * 60; // 15 minut w sekundach
          
          // Jeśli minęło więcej niż 15 minut, pomiń tę rezerwację (nie blokuje już terminu)
          if (elapsed >= totalTime) {
            continue;
          }
        }
        
        // Oblicz czas trwania rezerwacji na podstawie start_time i end_time
        const resStart = parseInt(r.start_time.split(':')[0], 10);
        const resEnd = parseInt(r.end_time.split(':')[0], 10);
        
        // Jeśli end_time jest wcześniejsze niż start_time, to znaczy że rezerwacja przechodzi na następny dzień
        let resDuration;
        if (resEnd <= resStart) {
          resDuration = (24 - resStart) + resEnd; // np. 11:00 do 10:00 = 23 godziny
        } else {
          resDuration = resEnd - resStart; // np. 11:00 do 15:00 = 4 godziny
        }
        
        // Sprawdź czy nowa rezerwacja koliduje z istniejącą
        for (let h = startHour; h < startHour + dur; h++) {
          if (h >= resStart && h < resStart + resDuration) return false;
        }
      }
      return true;
    });
    res.json(available);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DOSTĘPNOŚĆ STANOWISK W ZAKRESIE DAT ---
// GET /api/spots/availability?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
app.get('/api/spots/availability', async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: 'Brak wymaganych parametrów.' });
  }
  
  console.log('🔍 DEBUG AVAILABILITY - PARAMETRY WEJŚCIOWE:');
  console.log('dateFrom:', dateFrom, 'typ:', typeof dateFrom);
  console.log('dateTo:', dateTo, 'typ:', typeof dateTo);
  
  try {
    const dbPool = await checkDatabaseConnection();
    
    // Pobierz wszystkie stanowiska
    const [spots] = await dbPool.query('SELECT * FROM spots WHERE is_active = 1');
    
    // Pobierz rezerwacje w zakresie (opłacone i oczekujące)
    const [reservations] = await dbPool.query(
      'SELECT spot_id, date, end_date, status, created_at FROM reservations WHERE (date < ? AND end_date > ?) AND status IN ("opłacona", "oczekująca")',
      [dateTo, dateFrom]
    );
    
    // Pobierz blokady w zakresie - wszystkie source
    const [blocks] = await dbPool.query(
      'SELECT spot_id, date FROM spot_blocks WHERE date >= ? AND date <= ?',
      [dateFrom, dateTo]
    );
    
    console.log('🔍 DEBUG AVAILABILITY - DANE Z BAZY:');
    console.log('Rezerwacje w zakresie:', reservations);
    console.log('Blokady w zakresie:', blocks);
    
    // Generuj listę wszystkich dni w zakresie (bez ostatniego dnia)
    const daysInRange = [];
    let d = new Date(dateFrom + 'T00:00:00');
    const end = new Date(dateTo + 'T00:00:00');
    while (d < end) {
      // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
      const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      daysInRange.push(dateStr);
      d.setDate(d.getDate() + 1);
    }
    
    console.log('🔍 DEBUG AVAILABILITY - DNI W ZAKRESIE:');
    console.log('daysInRange:', daysInRange);
    
    // Dla każdego stanowiska sprawdź zajętość każdego dnia
    const result = spots.map(spot => {
      const spotReservations = reservations.filter(r => r.spot_id === spot.id);
      const spotBlocks = blocks.filter(b => b.spot_id === spot.id).map(b => {
        return formatDateForDisplay(b.date);
      });
      
      console.log(`🔍 DEBUG AVAILABILITY - STANOWISKO ${spot.id}:`);
      console.log('  Rezerwacje:', spotReservations);
      console.log('  Blokady (po konwersji):', spotBlocks);
      
      const busyDays = [];
      
      for (const day of daysInRange) {
        let isBusy = false;
        
        // Sprawdź rezerwacje
        for (const resv of spotReservations) {
          // Dla rezerwacji "oczekująca" sprawdź czy nie minęło 15 minut
          if (resv.status === 'oczekująca') {
            const created = new Date(resv.created_at);
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - created.getTime()) / 1000);
            const totalTime = 15 * 60; // 15 minut w sekundach
            
            // Jeśli minęło więcej niż 15 minut, pomiń tę rezerwację (nie blokuje już terminu)
            if (elapsed >= totalTime) {
              console.log(`  Rezerwacja ${resv.id} wygasła (${elapsed}s > ${totalTime}s)`);
              continue;
            }
          }
          
          const resvStart = formatDateForDisplay(resv.date);
          const resvEnd = formatDateForDisplay(resv.end_date);
          
          console.log(`  Sprawdzam rezerwację: ${resvStart} - ${resvEnd} dla dnia ${day}`);
          
          if (day >= resvStart && day < resvEnd) {
            console.log(`  ✅ Dzień ${day} zajęty przez rezerwację`);
            isBusy = true;
            break;
          }
        }
        
        // Sprawdź blokady (wszystkie source: admin, paid_reservation, reservation)
        if (!isBusy && spotBlocks.includes(day)) {
          console.log(`  ✅ Dzień ${day} zajęty przez blokadę`);
          isBusy = true;
        }
        
        if (isBusy) {
          busyDays.push(day);
        }
      }
      
      console.log(`  Zajęte dni dla stanowiska ${spot.id}:`, busyDays);
      
      return {
        id: spot.id,
        isBusy: busyDays.length > 0,
        busyDays: busyDays
      };
    });
    
    console.log('🔍 DEBUG AVAILABILITY - WYNIK KOŃCOWY:');
    console.log('result:', result);
    
    res.json(result);
  } catch (err) {
    console.error('❌ Błąd w availability:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- SPRAWDZENIE I UTWORZENIE TABELI SPOT_BLOCKS ---
// GET /api/check-db-structure
app.get('/api/check-db-structure', async (req, res) => {
  try {
    const dbPool = await checkDatabaseConnection();
    
    // Sprawdź czy tabela spot_blocks istnieje
    const [tables] = await dbPool.query('SHOW TABLES LIKE "spot_blocks"');
    
    if (tables.length === 0) {
      console.log('🔧 Tabela spot_blocks nie istnieje, tworzę...');
      await dbPool.query(`
        CREATE TABLE spot_blocks (
          id INT PRIMARY KEY AUTO_INCREMENT,
          spot_id INT NOT NULL,
          date DATE NOT NULL,
          source VARCHAR(32) NOT NULL DEFAULT 'admin',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (spot_id) REFERENCES spots(id)
        )
      `);
      console.log('✅ Tabela spot_blocks utworzona');
    } else {
      console.log('✅ Tabela spot_blocks istnieje');
      // Sprawdź czy kolumna hour istnieje i usuń ją jeśli tak
      const [columns] = await dbPool.query('DESCRIBE spot_blocks');
      const hasHourColumn = columns.some(col => col.Field === 'hour');
      if (hasHourColumn) {
        console.log('🔧 Usuwam kolumnę hour z tabeli spot_blocks...');
        await dbPool.query('ALTER TABLE spot_blocks DROP COLUMN hour');
        console.log('✅ Kolumna hour usunięta');
      }
      // Sprawdź czy kolumna source istnieje, jeśli nie - dodaj ją
      const hasSourceColumn = columns.some(col => col.Field === 'source');
      if (!hasSourceColumn) {
        console.log('🔧 Dodaję kolumnę source do tabeli spot_blocks...');
        await dbPool.query('ALTER TABLE spot_blocks ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT "admin"');
        console.log('✅ Kolumna source dodana');
      }
    }
    
    // Sprawdź strukturę tabeli
    const [columns] = await dbPool.query('DESCRIBE spot_blocks');
    console.log('📋 Struktura tabeli spot_blocks:', columns);
    
    res.json({ 
      success: true, 
      tableExists: tables.length > 0,
      columns: columns 
    });
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania struktury bazy:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- ZARZĄDZANIE BLOKADAMI ---
// DELETE /api/spot-blocks/clear-all – usuń wszystkie blokady
app.delete('/api/spot-blocks/clear-all', async (req, res) => {
  try {
    const dbPool = await checkDatabaseConnection();
    
    // Usuń wszystkie blokady (bez rozróżniania source)
    const [result] = await dbPool.query('DELETE FROM spot_blocks');
    console.log(`🗑️ Usunięto wszystkie blokady (${result.affectedRows} rekordów)`);
    res.json({ 
      success: true, 
      message: `Usunięto ${result.affectedRows} blokad`,
      deletedCount: result.affectedRows 
    });
  } catch (error) {
    console.error('❌ Błąd podczas usuwania blokad:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- CRUD STANOWISK ---
// POST /api/spots – dodaj stanowisko
app.post('/api/spots', async (req, res) => {
  const { name, is_active } = req.body;
  try {
    const dbPool = await checkDatabaseConnection();
    const [result] = await dbPool.query('INSERT INTO spots (is_active) VALUES (?)', [is_active !== undefined ? is_active : 1]);
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// DELETE /api/spots/:id – usuń stanowisko
app.delete('/api/spots/:id', async (req, res) => {
  const spotId = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    await dbPool.query('DELETE FROM spots WHERE id = ?', [spotId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// PATCH /api/spots/:id – zmień status aktywności
app.patch('/api/spots/:id', async (req, res) => {
  const spotId = req.params.id;
  const { is_active } = req.body;
  try {
    const dbPool = await checkDatabaseConnection();
    await dbPool.query('UPDATE spots SET is_active = ? WHERE id = ?', [is_active, spotId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REZERWACJE ---
// GET /api/reservations/:id – szczegóły rezerwacji
app.get('/api/reservations/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    const [rows] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Nie znaleziono rezerwacji.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spots/:id/reservations – rezerwacje dla stanowiska
app.get('/api/spots/:id/reservations', async (req, res) => {
  const spotId = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    const [rows] = await dbPool.query('SELECT * FROM reservations WHERE spot_id = ?', [spotId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/reservations/:id – aktualizuj status rezerwacji
app.patch('/api/reservations/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  
  console.log(`DEBUG: Aktualizacja statusu rezerwacji ${id} na: ${status}`);
  
  if (!status) {
    return res.status(400).json({ error: 'Brak wymaganych danych' });
  }

  try {
    const dbPool = await checkDatabaseConnection();
    
    // Sprawdź czy można zmienić status
    const [currentReservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (currentReservation.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const resv = currentReservation[0];
    const currentStatus = resv.status;
    
    // Walidacja statusów
    if (status === 'anulowana' && currentStatus !== 'opłacona' && currentStatus !== 'oczekująca') {
      return res.status(400).json({ error: 'Można anulować tylko rezerwacje o statusie "opłacona" lub "oczekująca"' });
    }
    
    // Sprawdź czy można anulować opłaconą rezerwację (3 dni przed)
    if (status === 'anulowana' && currentStatus === 'opłacona') {
      const reservationDate = new Date(formatDateForDisplay(resv.date));
      const now = new Date();
      const threeDaysBefore = new Date(reservationDate);
      threeDaysBefore.setDate(reservationDate.getDate() - 3);
      
      if (now > threeDaysBefore) {
        return res.status(400).json({ error: 'Nie można anulować rezerwacji. Anulowanie możliwe tylko do 3 dni przed rozpoczęciem rezerwacji.' });
      }
    }
    
    if (status === 'zwrot' && currentStatus !== 'opłacona') {
      return res.status(400).json({ error: 'Można zgłosić zwrot tylko dla rezerwacji o statusie "opłacona"' });
    }
    
    // Nowe walidacje dla nowych statusów
    if (status === 'zwrot_zgloszony' && currentStatus !== 'opłacona') {
      return res.status(400).json({ error: 'Można zgłosić zwrot tylko dla rezerwacji o statusie "opłacona"' });
    }
    
    if (status === 'anulowana_admin' && currentStatus !== 'opłacona') {
      return res.status(400).json({ error: 'Można anulować przez admina tylko rezerwacje o statusie "opłacona"' });
    }
    
    if (status === 'zwrot_zrealizowany' && currentStatus !== 'zwrot_zgloszony') {
      return res.status(400).json({ error: 'Można zrealizować zwrot tylko dla rezerwacji o statusie "zwrot_zgloszony"' });
    }
    
    if (status === 'zwrot_admin_zrealizowany' && currentStatus !== 'anulowana_admin') {
      return res.status(400).json({ error: 'Można zrealizować zwrot po anulacji tylko dla rezerwacji o statusie "anulowana_admin"' });
    }
    
    await dbPool.query('UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
    console.log(`DEBUG: Status zaktualizowany w bazie danych`);
    
    // Jeśli status zmieniono na "opłacona", zmień source blokad i wyślij email
    if (status === 'opłacona') {
      console.log(`DEBUG: Status to "opłacona", pobieram dane rezerwacji`);
      console.log(`DEBUG: Znalezione rezerwacje: 1`);
      if (resv) {
        
        // Zmień source blokad z 'reservation' na 'paid_reservation'
        const startDate = formatDateForDisplay(resv.date);
        const endDate = formatDateForDisplay(resv.end_date);
        
        // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
        // NIE blokuj dnia wyjazdu (end_date) - to dzień wyjazdu o 10:00
        const blockDates = [];
        let currentDate = new Date(startDate + 'T00:00:00');
        const endDateObj = new Date(endDate + 'T00:00:00');
        while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
          // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
          const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
          blockDates.push(dateStr);
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Usuń stare blokady z source 'reservation' i dodaj nowe z source 'paid_reservation'
        for (const blockDate of blockDates) {
          try {
            // Usuń starą blokadę
            await dbPool.query(
              'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
              [resv.spot_id, blockDate, 'reservation']
            );
            
            // Dodaj nową blokadę z source 'paid_reservation'
            await dbPool.query(
              'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
              [resv.spot_id, blockDate, 'paid_reservation']
            );
            
            console.log(`✅ Zmieniono source blokady: stanowisko ${resv.spot_id}, data ${blockDate}, source: paid_reservation`);
          } catch (error) {
            console.error(`❌ Błąd podczas zmiany source blokady:`, error);
          }
        }
        
        console.log(`✅ Zmieniono source ${blockDates.length} blokad dla rezerwacji ${resv.id} na 'paid_reservation'`);
        
        console.log(`DEBUG: Wysyłam email z potwierdzeniem do: ${resv.email}`);
        await sendPaymentConfirmationEmail(resv);
        console.log(`DEBUG: Email wysłany pomyślnie`);
      }
    }
    
    // Jeśli status zmieniono na "anulowana", usuń blokady
    if (status === 'anulowana') {
      console.log(`DEBUG: Status to "anulowana", usuwam blokady`);
      
      // Usuń blokady dla tej rezerwacji (wszystkie source: reservation, paid_reservation)
      const startDate = formatDateForDisplay(resv.date);
      const endDate = formatDateForDisplay(resv.end_date);
      
      // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
      const blockDates = [];
      let currentDate = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
        // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
        const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
        blockDates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Usuń blokady z source 'reservation' i 'paid_reservation'
      for (const blockDate of blockDates) {
        try {
          await dbPool.query(
            'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source IN (?, ?)',
            [resv.spot_id, blockDate, 'reservation', 'paid_reservation']
          );
          console.log(`🔓 Usunięto blokadę rezerwacji: stanowisko ${resv.spot_id}, data ${blockDate}`);
        } catch (error) {
          console.error(`❌ Błąd podczas usuwania blokady:`, error);
        }
      }
      
      console.log(`🔓 Usunięto ${blockDates.length} blokad dla anulowanej rezerwacji ${resv.id} (dni: ${blockDates.join(', ')})`);
    }
    
    // Nowa logika dla nowych statusów
    if (status === 'zwrot_zgloszony') {
      console.log(`DEBUG: Status to "zwrot_zgloszony", usuwam blokady i wysyłam email`);
      
      // Usuń blokady dla tej rezerwacji (zachowaj blokady admina)
      const startDate = formatDateForDisplay(resv.date);
      const endDate = formatDateForDisplay(resv.end_date);
      
      const blockDates = [];
      let currentDate = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
        const dateStr = currentDate.toLocaleDateString('en-CA');
        blockDates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      for (const blockDate of blockDates) {
        try {
          // Usuń tylko blokady z source 'reservation' i 'paid_reservation', zachowaj 'admin'
          await dbPool.query(
            'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source IN (?, ?)',
            [resv.spot_id, blockDate, 'reservation', 'paid_reservation']
          );
          console.log(`🔓 Usunięto blokadę rezerwacji: stanowisko ${resv.spot_id}, data ${blockDate}`);
        } catch (error) {
          console.error(`❌ Błąd podczas usuwania blokady:`, error);
        }
      }
      
      console.log(`🔓 Usunięto ${blockDates.length} blokad dla zwrotu zgłoszonego ${resv.id}`);
      await sendRefundRequestedEmail(resv);
    }
    
    if (status === 'anulowana_admin') {
      console.log(`DEBUG: Status to "anulowana_admin", usuwam blokady i wysyłam email`);
      
      // Usuń blokady dla tej rezerwacji (zachowaj blokady admina)
      const startDate = formatDateForDisplay(resv.date);
      const endDate = formatDateForDisplay(resv.end_date);
      
      const blockDates = [];
      let currentDate = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
        const dateStr = currentDate.toLocaleDateString('en-CA');
        blockDates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      for (const blockDate of blockDates) {
        try {
          // Usuń tylko blokady z source 'reservation' i 'paid_reservation', zachowaj 'admin'
          await dbPool.query(
            'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source IN (?, ?)',
            [resv.spot_id, blockDate, 'reservation', 'paid_reservation']
          );
          console.log(`🔓 Usunięto blokadę rezerwacji: stanowisko ${resv.spot_id}, data ${blockDate}`);
        } catch (error) {
          console.error(`❌ Błąd podczas usuwania blokady:`, error);
        }
      }
      
      console.log(`🔓 Usunięto ${blockDates.length} blokad dla anulowanej przez admina rezerwacji ${resv.id}`);
      await sendAdminCancellationEmail(resv);
    }
    
    if (status === 'zwrot_zrealizowany') {
      console.log(`DEBUG: Status to "zwrot_zrealizowany", usuwam blokady i wysyłam email`);
      
      // Usuń blokady dla tej rezerwacji (zachowaj blokady admina)
      const startDate = formatDateForDisplay(resv.date);
      const endDate = formatDateForDisplay(resv.end_date);
      
      const blockDates = [];
      let currentDate = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
        const dateStr = currentDate.toLocaleDateString('en-CA');
        blockDates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      for (const blockDate of blockDates) {
        try {
          // Usuń tylko blokady z source 'reservation' i 'paid_reservation', zachowaj 'admin'
          await dbPool.query(
            'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source IN (?, ?)',
            [resv.spot_id, blockDate, 'reservation', 'paid_reservation']
          );
          console.log(`🔓 Usunięto blokadę rezerwacji: stanowisko ${resv.spot_id}, data ${blockDate}`);
        } catch (error) {
          console.error(`❌ Błąd podczas usuwania blokady:`, error);
        }
      }
      
      console.log(`🔓 Usunięto ${blockDates.length} blokad dla zrealizowanego zwrotu ${resv.id}`);
      await sendRefundCompletedEmail(resv);
    }
    
    if (status === 'zwrot_admin_zrealizowany') {
      console.log(`DEBUG: Status to "zwrot_admin_zrealizowany", usuwam blokady i wysyłam email`);
      
      // Usuń blokady dla tej rezerwacji (zachowaj blokady admina)
      const startDate = formatDateForDisplay(resv.date);
      const endDate = formatDateForDisplay(resv.end_date);
      
      const blockDates = [];
      let currentDate = new Date(startDate + 'T00:00:00');
      const endDateObj = new Date(endDate + 'T00:00:00');
      while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
        const dateStr = currentDate.toLocaleDateString('en-CA');
        blockDates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      for (const blockDate of blockDates) {
        try {
          // Usuń tylko blokady z source 'reservation' i 'paid_reservation', zachowaj 'admin'
          await dbPool.query(
            'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source IN (?, ?)',
            [resv.spot_id, blockDate, 'reservation', 'paid_reservation']
          );
          console.log(`🔓 Usunięto blokadę rezerwacji: stanowisko ${resv.spot_id}, data ${blockDate}`);
        } catch (error) {
          console.error(`❌ Błąd podczas usuwania blokady:`, error);
        }
      }
      
      console.log(`🔓 Usunięto ${blockDates.length} blokad dla zrealizowanego zwrotu po anulacji ${resv.id}`);
      await sendAdminRefundCompletedEmail(resv);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(`DEBUG: Błąd podczas aktualizacji statusu:`, err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payment/p24/test-connection – test połączenia z sandbox
app.get('/api/payment/p24/test-connection', async (req, res) => {
  try {
    // Sprawdź IP z którego wysyłamy żądanie
    let clientIP = 'unknown';
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      clientIP = ipData.ip;
      console.log('🌐 IP z którego wysyłamy żądanie do Przelewy24:', clientIP);
    } catch (ipError) {
      console.log('⚠️ Nie udało się sprawdzić IP:', ipError.message);
    }
    
    const testResult = await testP24Connection();
    res.json({ 
      success: true, 
      testResult,
      clientIP: clientIP,
      config: {
        baseUrl: P24_CONFIG.baseUrl,
        merchantId: P24_CONFIG.merchantId,
        posId: P24_CONFIG.posId,
        sandbox: P24_CONFIG.sandbox
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/create-payment – nowy endpoint zgodnie z instrukcją ChatGPT
app.post('/api/create-payment', async (req, res) => {
  const {
    sessionId,
    amount,
    description,
    email,
    client,
    token
  } = req.body;

  // Dodaj timeout dla tego endpointu
  const timeout = setTimeout(() => {
    console.log('⏰ Timeout dla endpointu create-payment');
    if (!res.headersSent) {
      res.status(408).json({ 
        error: 'Request timeout',
        message: 'Serwer nie odpowiedział w czasie',
        timestamp: new Date().toISOString()
      });
    }
  }, 30000); // 30 sekund timeout

  try {
    console.log('🚀 Tworzę płatność Przelewy24');
    console.log('📦 Dane płatności:', { sessionId, amount, description, email, client });

    const dbPool = await checkDatabaseConnection();

    // Znajdź rezerwację po tokenie
    const [reservations] = await dbPool.query('SELECT id, status FROM reservations WHERE token = ?', [token]);
    if (reservations.length === 0) {
      console.log('❌ Nie znaleziono rezerwacji dla tokenu:', token);
      clearTimeout(timeout);
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const reservation = reservations[0];
    const reservationId = reservation.id;
    console.log('📋 Rezerwacja:', { id: reservationId, status: reservation.status });
    
    // Sprawdź czy rezerwacja nie jest w statusie "platnosc_w_toku" (zablokowana)
    if (reservation.status === 'platnosc_w_toku') {
      console.log('❌ Rezerwacja w statusie "platnosc_w_toku" - płatność zablokowana');
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Nie możesz już rozpocząć nowej płatności. Rezerwacja wygasła, ale możesz dokończyć płatność w Przelewy24.' });
    }

    // Generuj unikalny sessionId
    const uniqueSessionId = generateUniqueSessionId();
    console.log('🔑 Wygenerowany sessionId:', uniqueSessionId);

  const merchantId = P24_CONFIG.merchantId;
  const posId = merchantId;
  const currency = "PLN";
  const country = "PL";
  const language = "pl";

    // Generuj podpis dla rejestracji
    const sign = calculateRegistrationSign(uniqueSessionId, amount, currency);

  const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString("base64");

    console.log('🔐 Dane autoryzacji:', {
      posId: P24_CONFIG.posId,
      reportKey: P24_CONFIG.reportKey,
      auth: auth
    });
    
    console.log('📝 Podpis rejestracji:', sign);

    const transactionData = {
    merchantId,
    posId,
      sessionId: uniqueSessionId,
    amount,
    currency,
    description,
    email,
    client,
    country,
    language,
    urlReturn: `${DOMAIN_CONFIG.frontend}/payment/return/${token}?fromPayment=true`,
    urlStatus: `${DOMAIN_CONFIG.backend}/api/payment/p24/status`,
    sign,
    timeLimit: 5
    };

    console.log('📤 Wysyłam żądanie rejestracji:', {
      url: `${P24_CONFIG.baseUrl}/transaction/register`,
      data: transactionData
    });

    // Dodaj timeout dla fetch
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 15000); // 15 sekund timeout dla fetch

    const response = await fetch(
      `${P24_CONFIG.baseUrl}/transaction/register`,
      {
      method: 'POST',
      headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`
      },
        body: JSON.stringify(transactionData),
        signal: controller.signal
      }
    );

    clearTimeout(fetchTimeout);
    console.log('📡 Status odpowiedzi z Przelewy24:', response.status);
    
    if (response.status !== 200) {
      const errorData = await response.json();
      console.log('❌ Błąd z Przelewy24:', JSON.stringify(errorData, null, 2));
      clearTimeout(timeout);
      return res.status(400).json({ error: 'Błąd Przelewy24', details: errorData });
    }
    
    const data = await response.json();
    console.log('✅ Odpowiedź z Przelewy24:', JSON.stringify(data, null, 2));

    if (data && data.data && data.data.token) {
      // ZAPISZ ZARÓWNO sessionId JAK I token P24
      console.log('💾 Zapisuję tokeny w bazie danych');
      console.log('   sessionId:', uniqueSessionId);
      console.log('   p24_token:', data.data.token);
      console.log('   reservation_id:', reservationId);
      
      const dbPool = await checkDatabaseConnection();
      await dbPool.query(
        'UPDATE reservations SET payment_id = ?, p24_token = ? WHERE id = ?', 
        [uniqueSessionId, data.data.token, reservationId]
      );
      
      console.log('✅ Tokeny zapisane pomyślnie');
    
    const paymentUrl = getP24RedirectUrl(data.data.token);
    res.json({
        success: true,
        token: data.data.token,
        paymentUrl
      });
    } else {
      console.log('❌ Brak tokenu w odpowiedzi:', data);
      clearTimeout(timeout);
      res.status(500).json({ error: 'Brak tokenu w odpowiedzi', details: data });
    }
  } catch (error) {
    console.error('❌ Błąd w tworzeniu płatności:', error);
    clearTimeout(timeout);
    
    // Jeśli to błąd timeout, zwróć specjalny komunikat
    if (error.name === 'AbortError') {
      console.log('⏰ Timeout podczas tworzenia płatności w Przelewy24');
      return res.status(408).json({ 
        error: 'Payment timeout',
        message: 'Przelewy24 nie odpowiedział w czasie. Spróbuj ponownie.',
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reservations/:id/payment/test – test płatności (tylko dla sandbox)
app.post('/api/reservations/:id/payment/test', async (req, res) => {
  if (!P24_CONFIG.sandbox) {
    return res.status(403).json({ error: 'Test endpoint dostępny tylko w trybie sandbox' });
  }
  
  const id = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    const [reservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (reservation.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    const resv = reservation[0];
    if (resv.status !== 'oczekująca') {
      return res.status(400).json({ error: 'Test płatności możliwy tylko dla rezerwacji o statusie "oczekująca"' });
    }
    
    // Symuluj udaną płatność
    const sessionId = `test_${resv.id}_${Date.now()}`;
    await dbPool.query('UPDATE reservations SET payment_id = ?, status = ?, updated_at = NOW() WHERE id = ?', 
      [sessionId, 'opłacona', id]);
    
    // Wyślij email z potwierdzeniem
    await sendPaymentConfirmationEmail(resv);
    
    res.json({
      success: true,
      message: 'Test płatności zakończony pomyślnie',
      paymentId: sessionId,
      status: 'opłacona'
    });
  } catch (err) {
    console.error('Błąd podczas testu płatności:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/test-reservation – utwórz testową rezerwację oczekującą
app.post('/api/test-reservation', async (req, res) => {
  if (!P24_CONFIG.sandbox) {
    return res.status(403).json({ error: 'Test endpoint dostępny tylko w trybie sandbox' });
  }
  
  try {
    // Ustaw datę na kilka godzin w przyszłości
    const now = new Date();
    const futureDate = new Date(now.getTime() + (4 * 60 * 60 * 1000)); // 4 godziny w przyszłości
    const futureEndDate = new Date(futureDate.getTime() + (24 * 60 * 60 * 1000)); // +1 dzień
    
    const date = futureDate.toISOString().split('T')[0];
    const end_date = futureEndDate.toISOString().split('T')[0];
    const start_time = '11:00:00';
    const end_time = '10:00:00';
    const token = uuidv4();
    
    // Ustaw status na "oczekująca" i zamroź odliczanie
    const status = 'oczekująca';
    const amount = 210.00; // 3 doby * 70 zł
    
    const dbPool = await checkDatabaseConnection();
    const [result] = await dbPool.query(
      `INSERT INTO reservations (first_name, last_name, phone, car_plate, email, spot_id, date, start_time, end_date, end_time, status, token, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Test', 'Użytkownik', '123456789', 'TEST123', 'test@example.com', 1, date, start_time, end_date, end_time, status, token, amount]
    );
    
    console.log('✅ Utworzono testową rezerwację oczekującą:');
    console.log('   ID:', result.insertId);
    console.log('   Status:', status);
    console.log('   Data:', date);
    console.log('   Token:', token);
    console.log('   Kwota:', amount);
    console.log('   Odliczanie zamrożone na kilka godzin');
    
    res.json({
      success: true,
      message: 'Testowa rezerwacja oczekująca utworzona pomyślnie',
      reservation: {
        id: result.insertId,
        status: status,
        date: date,
        end_date: end_date,
        token: token,
        amount: amount,
        created_at: created_at,
        updated_at: updated_at
      }
    });
  } catch (err) {
    console.error('Błąd podczas tworzenia testowej rezerwacji:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rezerwacja/:token – obsługa powrotu z Przelewy24 i automatyczna zmiana statusu
app.get('/api/rezerwacja/:token', async (req, res) => {
  const token = req.params.token;
  
  try {
    const dbPool = await checkDatabaseConnection();
    
    // Znajdź rezerwację po tokenie
    const [reservations] = await dbPool.query('SELECT * FROM reservations WHERE token = ?', [token]);
    
    if (reservations.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const reservation = reservations[0];
    console.log('🔍 Znaleziono rezerwację dla tokenu:', token);
    console.log('   ID:', reservation.id);
    console.log('   Status:', reservation.status);
    console.log('   Payment ID:', reservation.payment_id);
    
    // Sprawdź czy rezerwacja ma payment_id (czy była próba płatności)
    if (reservation.payment_id) {
      console.log('💰 Rezerwacja ma payment_id:', reservation.payment_id);
      console.log('🔍 Sprawdzam status płatności w Przelewy24...');
      
      // Sprawdź status płatności w Przelewy24 (dla sandboxa)
      try {
        const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
        
        // Użyj p24_token jeśli istnieje, w przeciwnym razie użyj payment_id (fallback dla starych rezerwacji)
        const tokenToUse = reservation.p24_token || reservation.payment_id;
        console.log('🔧 Używam token:', tokenToUse);
        console.log('🌐 Wysyłam żądanie do Przelewy24:', `${P24_CONFIG.baseUrl}/transaction/status/${tokenToUse}`);
        const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/status/${tokenToUse}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
          }
        });
        
        console.log('📡 Status odpowiedzi z Przelewy24:', response.status);
        if (response.status === 200) {
          const paymentData = await response.json();
          console.log('📊 Status płatności z Przelewy24:', JSON.stringify(paymentData, null, 2));
          
          // Sprawdź czy płatność została zrealizowana
          // Status 1 = udana płatność, Status 0 = oczekująca
          if (paymentData.data && paymentData.data.status === 1) { // 1 = udana płatność
            console.log('✅ Płatność potwierdzona przez status=1 – weryfikuję kwotę i transakcję (return endpoint)');
            
            // Utwardzenie: sprawdź zgodność kwoty i wykonaj verify
            const expectedAmount = Math.round(Number(reservation.amount || 0) * 100);
            const reportedAmount = Number(
              (paymentData?.data?.amount ?? paymentData?.data?.originAmount ?? NaN)
            );
            const orderIdCandidate = paymentData?.data?.orderId ?? paymentData?.data?.order_id ?? null;

            let verified = false;
            if (Number.isFinite(reportedAmount) && reportedAmount === expectedAmount && orderIdCandidate) {
              try {
                const verificationResult = await verifyTransaction(
                  reservation.payment_id,
                  orderIdCandidate,
                  expectedAmount,
                  paymentData?.data?.currency || 'PLN'
                );
                verified = verificationResult?.data?.status === 'success';
              } catch (e) {
                console.error('❌ Błąd verifyTransaction (return endpoint):', e);
              }
            } else {
              console.warn('⚠️ Brak zgodnej kwoty lub orderId – nie ustawiam "opłacona" (return endpoint).', { expectedAmount, reportedAmount, hasOrderId: !!orderIdCandidate });
            }

            if (verified) {
              // Zmień status na "opłacona"
              await dbPool.query('UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?', ['opłacona', reservation.id]);
              
              // Zmień source blokad z 'reservation' na 'paid_reservation' (rezerwacja potwierdzona)
              const startDate = new Date(reservation.date);
              const endDate = new Date(reservation.end_date);
              
              // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
              const blockDates = [];
              let currentDate = new Date(startDate + 'T00:00:00');
              const endDateObj = new Date(endDate + 'T00:00:00');
              while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
                // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
                const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                blockDates.push(dateStr);
                currentDate.setDate(currentDate.getDate() + 1);
              }
              
              // Usuń stare blokady z source 'reservation' i dodaj nowe z source 'paid_reservation'
              for (const blockDate of blockDates) {
                try {
                  // Usuń starą blokadę
                  await dbPool.query(
                    'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
                    [reservation.spot_id, blockDate, 'reservation']
                  );
                  
                  // Dodaj nową blokadę z source 'paid_reservation'
                  await dbPool.query(
                    'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
                    [reservation.spot_id, blockDate, 'paid_reservation']
                  );
                  
                  console.log(`✅ Zmieniono source blokady: stanowisko ${reservation.spot_id}, data ${blockDate}, source: paid_reservation`);
                } catch (error) {
                  console.error(`❌ Błąd podczas zmiany source blokady:`, error);
                }
              }
              
              console.log(`✅ Zmieniono source ${blockDates.length} blokad dla rezerwacji ${reservation.id} na 'paid_reservation'`);
              
              // Wyślij email z potwierdzeniem
              await sendPaymentConfirmationEmail(reservation);
              
              return res.json({
                success: true,
                message: 'Płatność potwierdzona! Status rezerwacji zmieniony na "opłacona"',
                reservation: {
                  id: reservation.id,
                  status: 'opłacona',
                  payment_id: reservation.payment_id,
                  amount: reservation.amount
                }
              });
            }
          } else {
            console.log('❌ Płatność nie została zrealizowana (status:', paymentData.data?.status, ')');
            return res.json({
              success: false,
              message: 'Płatność nie została zrealizowana',
            redirectTo: `/rezerwacja-error/${reservation.token}?fromPayment=true`,
              reservation: {
                id: reservation.id,
                status: reservation.status,
                payment_id: reservation.payment_id
              }
            });
          }
        } else {
          console.log('❌ Nie udało się sprawdzić statusu płatności');
          return res.json({
            success: false,
            message: 'Nie udało się sprawdzić statusu płatności',
            reservation: {
              id: reservation.id,
              status: reservation.status,
              payment_id: reservation.payment_id
            }
          });
        }
      } catch (error) {
        console.error('❌ Błąd podczas sprawdzania statusu płatności:', error);
        return res.json({
          success: false,
          message: 'Błąd podczas sprawdzania statusu płatności',
          reservation: {
            id: reservation.id,
            status: reservation.status,
            payment_id: reservation.payment_id
          }
        });
      }
    } else {
      console.log('❌ Rezerwacja nie ma payment_id');
      return res.json({
        success: false,
        message: 'Rezerwacja nie ma przypisanej płatności',
        reservation: {
          id: reservation.id,
          status: reservation.status
        }
      });
    }
  } catch (err) {
    console.error('❌ Błąd podczas obsługi powrotu z płatności:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/check-payment/:token – ręczne sprawdzenie statusu płatności
app.get('/api/check-payment/:token', async (req, res) => {
  const token = req.params.token;
  
  try {
    const dbPool = await checkDatabaseConnection();
    const [reservations] = await dbPool.query('SELECT * FROM reservations WHERE token = ?', [token]);
    
    if (reservations.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const reservation = reservations[0];
    console.log('🔍 Sprawdzam status płatności dla rezerwacji:', reservation.id);
    console.log('   Token:', token);
    console.log('   Status:', reservation.status);
    console.log('   Payment ID:', reservation.payment_id);
    
    if (!reservation.payment_id) {
      return res.json({
        success: false,
        message: 'Brak payment_id - płatność nie została zainicjowana',
        reservation: {
          id: reservation.id,
          status: reservation.status
        }
      });
    }
    
    // Sprawdź status w Przelewy24
    const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
    
    const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/status/${reservation.payment_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });
    
    console.log('📡 Status odpowiedzi z Przelewy24:', response.status);
    
    if (response.status === 200) {
      const paymentData = await response.json();
      console.log('📊 Pełne dane płatności:', JSON.stringify(paymentData, null, 2));
      
      return res.json({
        success: true, 
        message: 'Status płatności sprawdzony',
        payment: paymentData,
        reservation: {
          id: reservation.id,
          status: reservation.status,
          payment_id: reservation.payment_id
        }
      });
    } else {
      const errorText = await response.text();
      console.log('❌ Błąd z Przelewy24:', errorText);
      
      return res.json({
        success: false, 
        message: 'Błąd podczas sprawdzania statusu płatności',
        error: errorText,
        reservation: {
          id: reservation.id,
          status: reservation.status,
          payment_id: reservation.payment_id
        }
      });
    }
  } catch (err) {
    console.error('❌ Błąd podczas sprawdzania płatności:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reservations/:id/payment – inicj płatność Przelewy24
app.post('/api/reservations/:id/payment', async (req, res) => {
  const id = req.params.id;
  const { amount, description } = req.body;
  try {
    const dbPool = await checkDatabaseConnection();
    const [reservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (reservation.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    const resv = reservation[0];
    if (resv.status === 'platnosc_w_toku') {
      return res.status(400).json({ error: 'Nie możesz już rozpocząć nowej płatności. Rezerwacja wygasła, ale możesz dokończyć płatność w Przelewy24.' });
    }
    if (resv.status !== 'oczekująca') {
      return res.status(400).json({ error: 'Płatność możliwa tylko dla rezerwacji o statusie "oczekująca"' });
    }
    const paymentAmount = amount || resv.amount;
    const p24Payment = await createP24Payment(resv, paymentAmount);
    
    console.log('Pełna odpowiedź z Przelewy24:', JSON.stringify(p24Payment, null, 2));
    
    // Sprawdź różne możliwe struktury odpowiedzi z Przelewy24
    if (p24Payment.error) {
      console.error('Błąd z Przelewy24:', p24Payment.error);
      return res.status(500).json({ error: 'Błąd podczas tworzenia płatności', details: p24Payment.error });
    }
    
    // Sprawdź czy mamy token do płatności
    const paymentToken = p24Payment.data?.token || p24Payment.token;
    const paymentUrl = p24Payment.data?.paymentUrl || p24Payment.paymentUrl;
    const sessionId = p24Payment.data?.sessionId || p24Payment.sessionId;
    
    if (!paymentToken && !paymentUrl) {
      console.error('Brak tokenu lub URL płatności w odpowiedzi:', p24Payment);
      return res.status(500).json({ error: 'Błąd podczas tworzenia płatności - brak URL płatności', details: p24Payment });
    }
    
          console.log('💾 Próbuję zapisać payment_id w bazie...');
      console.log('   paymentToken:', paymentToken);
      console.log('   reservation id:', id);
      
      // Zapisz payment_id (sessionId) i p24_token w bazie
      await dbPool.query('UPDATE reservations SET payment_id = ?, p24_token = ? WHERE id = ?', [sessionId, paymentToken, id]);
      console.log('✅ Zapisano payment_id:', sessionId, 'i p24_token:', paymentToken, 'dla rezerwacji:', id);
    
    // Zwróć dane płatności
    res.json({
      paymentId: sessionId,
      amount: paymentAmount,
                description: `Rezerwacja ID: ${resv.id} - Stanowisko ${resv.spot_id} - ${new Date(resv.date).toLocaleDateString('pl-PL')}`,
      paymentUrl: paymentUrl || getP24RedirectUrl(paymentToken)
    });
  } catch (err) {
    console.error('Błąd podczas inicjowania płatności:', err);
    res.status(500).json({ error: err.message, details: err });
  }
});

// POST /api/payment/p24/status – callback z Przelewy24
app.post('/api/payment/p24/status', async (req, res) => {
  const notification = req.body;
  
  console.log('🔔 CALLBACK - Otrzymano notyfikację z Przelewy24');
  console.log('📦 CALLBACK - Dane notyfikacji:', {
    sessionId: notification.sessionId,
    orderId: notification.orderId,
    amount: notification.amount,
    currency: notification.currency,
    status: notification.status,
    sign: notification.sign ? '***' : 'brak'
  });
  
  try {
    const dbPool = await checkDatabaseConnection();
    
    // 1. Znajdź rezerwację na podstawie sessionId
    console.log('🔍 CALLBACK - Szukam rezerwacji dla sessionId:', notification.sessionId);
    const [reservations] = await dbPool.query('SELECT * FROM reservations WHERE payment_id = ?', [notification.sessionId]);
    
    if (!reservations || reservations.length === 0) {
      console.error('❌ CALLBACK - Nie znaleziono rezerwacji dla sessionId:', notification.sessionId);
      return res.status(404).send('Reservation not found');
    }

    const reservation = reservations[0];
    console.log('📦 CALLBACK - Znaleziono rezerwację:', {
      id: reservation.id,
      status: reservation.status,
      amount: reservation.amount,
      payment_id: reservation.payment_id,
      p24_token: reservation.p24_token
    });

    // 2. Sprawdź czy kwota się zgadza
    const expectedAmount = Math.round(reservation.amount * 100);
    console.log('💰 CALLBACK - Sprawdzam kwotę');
    console.log('   Otrzymana kwota:', notification.amount);
    console.log('   Oczekiwana kwota:', expectedAmount);
    console.log('   Kwoty się zgadzają:', parseInt(notification.amount) === expectedAmount);
    
    if (parseInt(notification.amount) !== expectedAmount) {
      console.error('❌ CALLBACK - Nieprawidłowa kwota płatności:', notification.amount, 'oczekiwana:', expectedAmount);
      return res.status(400).send('Invalid amount');
    }

    // 3. KLUCZOWE: Wykonaj weryfikację transakcji w P24
    console.log('🔐 CALLBACK - Wykonuję weryfikację transakcji...');
    const verificationResult = await verifyTransaction(
      notification.sessionId,
      notification.orderId,
      notification.amount,
      notification.currency
    );

    console.log('📋 CALLBACK - Wynik weryfikacji:', verificationResult);

    if (verificationResult.data && verificationResult.data.status === 'success') {
      // 4. Aktualizuj status TYLKO po udanej weryfikacji
      console.log('💾 CALLBACK - Aktualizuję status na opłacona');
      await dbPool.query(
        'UPDATE reservations SET status = ?, updated_at = NOW() WHERE payment_id = ?',
        ['opłacona', notification.sessionId]
      );
    
    // Zmień source blokad z 'reservation' na 'paid_reservation' (rezerwacja potwierdzona)
      const startDate = formatDateForDisplay(reservation.date);
      const endDate = formatDateForDisplay(reservation.end_date);
    
    // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
    const blockDates = [];
    let currentDate = new Date(startDate + 'T00:00:00');
    const endDateObj = new Date(endDate + 'T00:00:00');
    while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
      // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
      const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      blockDates.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Usuń stare blokady z source 'reservation' i dodaj nowe z source 'paid_reservation'
    for (const blockDate of blockDates) {
      try {
        // Usuń starą blokadę
        await dbPool.query(
          'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
            [reservation.spot_id, blockDate, 'reservation']
        );
        
        // Dodaj nową blokadę z source 'paid_reservation'
        await dbPool.query(
          'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
            [reservation.spot_id, blockDate, 'paid_reservation']
        );
        
          console.log(`✅ CALLBACK - Zmieniono source blokady: stanowisko ${reservation.spot_id}, data ${blockDate}, source: paid_reservation`);
      } catch (error) {
          console.error(`❌ CALLBACK - Błąd podczas zmiany source blokady:`, error);
      }
    }
    
      console.log(`✅ CALLBACK - Zmieniono source ${blockDates.length} blokad dla rezerwacji ${reservation.id} na 'paid_reservation'`);
    
    // Wyślij email z potwierdzeniem
      await sendPaymentConfirmationEmail(reservation);
      
      console.log('✅ CALLBACK - Płatność potwierdzona i zweryfikowana dla sessionId:', notification.sessionId);
      res.status(200).send('OK');
    } else {
      console.error('❌ CALLBACK - Weryfikacja transakcji nie powiodła się:', verificationResult);
      res.status(400).send('Verification failed');
    }
    
  } catch (error) {
    console.error('❌ CALLBACK - Błąd przetwarzania notyfikacji:', error);
    res.status(500).send('Internal error');
  }
});

// GET /api/reservations/:id/can-refund – sprawdź czy można zgłosić zwrot
app.get('/api/reservations/:id/can-refund', async (req, res) => {
  const id = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    const [reservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (reservation.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const resv = reservation[0];
    
    // Sprawdź czy status to "opłacona"
    if (resv.status !== 'opłacona') {
      return res.json({ canRefund: false, reason: 'Tylko opłacone rezerwacje mogą być zwrócone' });
    }
    
    // Sprawdź czy do rezerwacji zostało więcej niż 3 dni
    const reservationDate = new Date(formatDateForDisplay(resv.date));
    const now = new Date();
    const threeDaysBefore = new Date(reservationDate);
    threeDaysBefore.setDate(reservationDate.getDate() - 3);
    
    if (now > threeDaysBefore) {
      return res.json({ canRefund: false, reason: 'Zwrot możliwy tylko do 3 dni przed rezerwacją' });
    }
    
    res.json({ canRefund: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reservations/:id/can-cancel – sprawdź czy można anulować rezerwację
app.get('/api/reservations/:id/can-cancel', async (req, res) => {
  const id = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    const [reservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (reservation.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const resv = reservation[0];
    
    // Sprawdź czy status to "opłacona"
    if (resv.status !== 'opłacona') {
      return res.json({ canCancel: false, reason: 'Tylko opłacone rezerwacje mogą być anulowane' });
    }
    
    // Sprawdź czy do rezerwacji zostało więcej niż 3 dni
    const reservationDate = new Date(formatDateForDisplay(resv.date));
    const now = new Date();
    const threeDaysBefore = new Date(reservationDate);
    threeDaysBefore.setDate(reservationDate.getDate() - 3);
    
    if (now > threeDaysBefore) {
      return res.json({ canCancel: false, reason: 'Anulowanie możliwe tylko do 3 dni przed rozpoczęciem rezerwacji' });
    }
    
    res.json({ canCancel: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reservations/:id – usunięcie rezerwacji
app.delete('/api/reservations/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const dbPool = await checkDatabaseConnection();
    
    // Pobierz dane rezerwacji przed usunięciem
    const [reservation] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    if (reservation.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono rezerwacji' });
    }
    
    const resv = reservation[0];
    
    // Usuń blokady dla tej rezerwacji (wszystkie source: reservation, paid_reservation)
    const startDate = formatDateForDisplay(resv.date);
    const endDate = formatDateForDisplay(resv.end_date);
    
    // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
    const blockDates = [];
    let currentDate = new Date(startDate + 'T00:00:00');
    const endDateObj = new Date(endDate + 'T00:00:00');
    while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
      // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
      const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
      blockDates.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Usuń blokady z source 'reservation' i 'paid_reservation'
    for (const blockDate of blockDates) {
      try {
        await dbPool.query(
          'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source IN (?, ?)',
          [resv.spot_id, blockDate, 'reservation', 'paid_reservation']
        );
        console.log(`🔓 Usunięto blokadę rezerwacji: stanowisko ${resv.spot_id}, data ${blockDate}`);
      } catch (error) {
        console.error(`❌ Błąd podczas usuwania blokady:`, error);
      }
    }
    
    console.log(`🔓 Usunięto ${blockDates.length} blokad dla rezerwacji ${resv.id} (dni: ${blockDates.join(', ')})`);
    
    // Usuń rezerwację
    await dbPool.query('DELETE FROM reservations WHERE id = ?', [id]);
    console.log(`🗑️ Usunięto rezerwację ${id}`);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Błąd podczas usuwania rezerwacji:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint dla Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Łowisko Młyn Rańsk API', 
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    timestamp: new Date().toISOString()
  });
});

// GET /api/reservation/status/:token – dynamiczne sprawdzanie statusu rezerwacji (polling)
app.get('/api/reservation/status/:token', async (req, res) => {
  const { token } = req.params;
  
  // Dodaj timeout dla tego endpointu
  const timeout = setTimeout(() => {
    console.log('⏰ Timeout dla endpointu statusu rezerwacji');
    if (!res.headersSent) {
      res.status(408).json({ 
        error: 'Request timeout',
        message: 'Serwer nie odpowiedział w czasie',
        timestamp: new Date().toISOString()
      });
    }
  }, 25000); // 25 sekund timeout
  
  try {
    console.log('🔍 Sprawdzam status rezerwacji dla tokenu:', token);
    
    const dbPool = await checkDatabaseConnection();
    
    // Pobierz aktualny status z bazy danych
    const [rows] = await dbPool.query('SELECT * FROM reservations WHERE token = ?', [token]);
    
    if (rows.length === 0) {
      console.log('❌ Nie znaleziono rezerwacji dla tokenu:', token);
      clearTimeout(timeout);
      return res.status(404).json({ error: 'Rezerwacja nie została znaleziona' });
    }
    
    const reservation = rows[0];
    console.log('📦 Rezerwacja znaleziona:', {
      id: reservation.id,
      status: reservation.status,
      payment_id: reservation.payment_id,
      p24_token: reservation.p24_token
    });
    
    // Sprawdź status płatności w Przelewy24 (jeśli ma payment_id)
    // ZMIANA: Sprawdzaj status płatności dla WSZYSTKICH rezerwacji z payment_id, nie tylko 'platnosc_w_toku'
    if (reservation.payment_id || reservation.p24_token) {
      try {
        console.log('🔍 Polling - Sprawdzam status płatności w Przelewy24...');
        console.log('💰 Polling - Payment ID (sessionId):', reservation.payment_id);
        console.log('🎫 Polling - P24 Token:', reservation.p24_token);
        
        // Użyj sessionId do sprawdzania statusu (prawidłowy endpoint)
        const sessionId = reservation.payment_id;
        console.log('🔧 Polling - Używam sessionId:', sessionId);
        
        const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
        // PRAWIDŁOWY endpoint do sprawdzania statusu
        const url = `${P24_CONFIG.baseUrl}/transaction/by/sessionId/${sessionId}`;
        
        console.log('🌐 Polling - URL:', url);
        console.log('🔑 Polling - Auth:', auth);
        
        // Dodaj timeout dla fetch
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 10000); // 10 sekund timeout dla fetch
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`
          },
          signal: controller.signal
        });
        
        clearTimeout(fetchTimeout);
        console.log('📡 Polling - Status odpowiedzi z Przelewy24:', response.status);
        
        if (response.status === 200) {
          const paymentData = await response.json();
          console.log('📊 Polling - Status płatności z Przelewy24:', JSON.stringify(paymentData, null, 2));
          
          // Sprawdź czy transakcja została ukończona
          if (paymentData.data && paymentData.data.status === 1) { // 1 = completed
            console.log('✅ Polling - Transakcja ukończona przez status=1 – weryfikuję kwotę i verify');

            // Utwardzenie: sprawdź zgodność kwoty i wykonaj verify
            const expectedAmount = Math.round(Number(reservation.amount || 0) * 100);
            const reportedAmount = Number(
              (paymentData?.data?.amount ?? paymentData?.data?.originAmount ?? NaN)
            );
            const orderIdCandidate = paymentData?.data?.orderId ?? paymentData?.data?.order_id ?? null;

            let verified = false;
            if (Number.isFinite(reportedAmount) && reportedAmount === expectedAmount && orderIdCandidate) {
              try {
                const verificationResult = await verifyTransaction(
                  reservation.payment_id,
                  orderIdCandidate,
                  expectedAmount,
                  paymentData?.data?.currency || 'PLN'
                );
                verified = verificationResult?.data?.status === 'success';
              } catch (e) {
                console.error('❌ Polling - Błąd verifyTransaction:', e);
              }
            } else {
              console.warn('⚠️ Polling - Brak zgodnej kwoty lub orderId – nie ustawiam "opłacona".', { expectedAmount, reportedAmount, hasOrderId: !!orderIdCandidate });
            }

            if (verified) {
              // Zmień status na "opłacona" (tylko jeśli nie jest już opłacona)
              if (reservation.status !== 'opłacona') {
                console.log('💾 Polling - Aktualizuję status w bazie z', reservation.status, 'na opłacona');
                  await dbPool.query(
                  'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ?',
                  ['opłacona', reservation.id]
                );
                
                // Zmień source blokad z 'reservation' na 'paid_reservation' (rezerwacja potwierdzona)
                const startDate = formatDateForDisplay(reservation.date);
                const endDate = formatDateForDisplay(reservation.end_date);
                
                // Generuj wszystkie dni w zakresie rezerwacji (w lokalnej strefie czasowej)
                const blockDates = [];
                let currentDate = new Date(startDate + 'T00:00:00');
                const endDateObj = new Date(endDate + 'T00:00:00');
                while (currentDate < endDateObj) { // Zmienione z <= na < - nie blokuj dnia wyjazdu
                  // Użyj toLocaleDateString zamiast toISOString aby zachować lokalną strefę czasową
                  const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
                  blockDates.push(dateStr);
                  currentDate.setDate(currentDate.getDate() + 1);
                }
                
                // Usuń stare blokady z source 'reservation' i dodaj nowe z source 'paid_reservation'
                for (const blockDate of blockDates) {
                  try {
                    // Usuń starą blokadę
                    await dbPool.query(
                      'DELETE FROM spot_blocks WHERE spot_id = ? AND date = ? AND source = ?',
                      [reservation.spot_id, blockDate, 'reservation']
                    );
                    
                    // Dodaj nową blokadę z source 'paid_reservation'
                    await dbPool.query(
                      'INSERT INTO spot_blocks (spot_id, date, source) VALUES (?, ?, ?)',
                      [reservation.spot_id, blockDate, 'paid_reservation']
                    );
                    
                    console.log(`✅ Polling - Zmieniono source blokady: stanowisko ${reservation.spot_id}, data ${blockDate}, source: paid_reservation`);
                  } catch (error) {
                    console.error(`❌ Polling - Błąd podczas zmiany source blokady:`, error);
                  }
                }
                
                console.log(`✅ Polling - Zmieniono source ${blockDates.length} blokad dla rezerwacji ${reservation.id} na 'paid_reservation'`);
                
                // Wyślij email z potwierdzeniem
                await sendPaymentConfirmationEmail(reservation);
              }
              
              // Pobierz zaktualizowaną rezerwację
              const [updatedRows] = await dbPool.query('SELECT * FROM reservations WHERE id = ?', [reservation.id]);
              console.log('✅ Polling - Zwracam zaktualizowaną rezerwację ze statusem "opłacona"');
              clearTimeout(timeout);
              return res.json(updatedRows[0]);
            }
          } else {
            console.log('❌ Polling - Płatność nie została zrealizowana (status:', paymentData.data?.status, ')');
          }
        } else {
          console.log('❌ Polling - Nie udało się sprawdzić statusu płatności (status:', response.status, ')');
          const errorData = await response.text();
          console.log('Błąd z Przelewy24:', errorData);
        }
      } catch (error) {
        console.error('❌ Polling - Błąd podczas sprawdzania statusu płatności:', error);
        
        // Jeśli to błąd timeout, zwróć specjalny status
        if (error.name === 'AbortError') {
          console.log('⏰ Polling - Timeout podczas sprawdzania statusu płatności');
          clearTimeout(timeout);
          return res.json({
            ...reservation,
            paymentTimeout: true,
            message: 'Timeout podczas sprawdzania płatności'
          });
        }
      }
    }
    
    // Oblicz czas od utworzenia rezerwacji
    const createdTime = new Date(reservation.created_at).getTime();
    const currentTime = Date.now();
    const secondsOld = Math.floor((currentTime - createdTime) / 1000);
    
    // Sprawdź czy można jeszcze płacić
    const canPay = reservation.status === 'oczekująca' && secondsOld < 900; // 15 minut
    
    console.log('📊 Polling - Zwracam status rezerwacji:', {
      status: reservation.status,
      secondsOld: secondsOld,
      canPay: canPay
    });
    
    clearTimeout(timeout);
    res.json({
      ...reservation,
      seconds_old: secondsOld,
      can_pay: canPay
    });
    
  } catch (error) {
    console.error('❌ Polling - Błąd podczas sprawdzania statusu rezerwacji:', error);
    clearTimeout(timeout);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Błąd podczas sprawdzania statusu rezerwacji',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/test-callback – test endpoint do sprawdzenia callback
app.get('/api/test-callback', (req, res) => {
  console.log('🧪 TEST CALLBACK - Endpoint dostępny');
  res.json({ 
    message: 'Callback endpoint dostępny',
    timestamp: new Date().toISOString(),
    server: 'fishing-api-backend.onrender.com'
  });
});

// POST /api/add-p24-order-id-column – dodaj kolumnę p24_order_id
app.post('/api/add-p24-order-id-column', async (req, res) => {
  try {
    console.log('🔧 Dodaję kolumnę p24_order_id do tabeli reservations');
    
    const dbPool = await checkDatabaseConnection();
    
    // Sprawdź czy kolumna już istnieje
    const [columns] = await dbPool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'reservations' 
      AND COLUMN_NAME = 'p24_order_id'
    `);
    
    if (columns.length > 0) {
      console.log('✅ Kolumna p24_order_id już istnieje');
      return res.json({ message: 'Kolumna p24_order_id już istnieje' });
    }
    
    // Dodaj kolumnę
    await dbPool.query('ALTER TABLE reservations ADD COLUMN p24_order_id INT');
    console.log('✅ Kolumna p24_order_id została dodana');
    
    res.json({ message: 'Kolumna p24_order_id została dodana pomyślnie' });
  } catch (error) {
    console.error('❌ Błąd podczas dodawania kolumny:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/add-p24-token-column – dodaj kolumnę p24_token
app.post('/api/add-p24-token-column', async (req, res) => {
  try {
    console.log('🔧 Dodaję kolumnę p24_token do tabeli reservations');
    
    const dbPool = await checkDatabaseConnection();
    
    // Sprawdź czy kolumna już istnieje
    const [columns] = await dbPool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'reservations' 
      AND COLUMN_NAME = 'p24_token'
    `);
    
    if (columns.length > 0) {
      console.log('✅ Kolumna p24_token już istnieje');
      return res.json({ message: 'Kolumna p24_token już istnieje' });
    }
    
    // Dodaj kolumnę
    await dbPool.query('ALTER TABLE reservations ADD COLUMN p24_token VARCHAR(255)');
    console.log('✅ Kolumna p24_token została dodana');
    
    res.json({ message: 'Kolumna p24_token została dodana pomyślnie' });
  } catch (error) {
    console.error('❌ Błąd podczas dodawania kolumny:', error);
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`API działa na http://0.0.0.0:${PORT}`);
  console.log(`Callback URL: https://fishing-api-backend.onrender.com/api/payment/p24/status`);
  
  // Test połączenia z bazą i sprawdzenie timezone
  if (pool) {
    try {
      const dbPool = await checkDatabaseConnection();
      const [timezoneTest] = await dbPool.query('SELECT NOW() as current_time_val, @@global.time_zone as global_tz, @@session.time_zone as session_tz');
      console.log('🔧 DEBUG BAZA DANYCH - TIMEZONE:');
      console.log('  current_time:', timezoneTest[0].current_time_val);
      console.log('  global_timezone:', timezoneTest[0].global_tz);
      console.log('  session_timezone:', timezoneTest[0].session_tz);
    } catch (error) {
      console.error('❌ Błąd podczas sprawdzania timezone:', error.message);
    }
  } else {
    console.log('⚠️ Baza danych niedostępna - pomijam sprawdzanie timezone');
  }
  
  // Uruchom timer do sprawdzania statusów rezerwacji co 1 sekundę dla lepszej synchronizacji
  setInterval(checkAndUpdateReservationStatuses, 1000); // 1000ms = 1 sekunda
  console.log('⏰ Timer statusów rezerwacji uruchomiony (sprawdzanie co 1 sekundę)');
  console.log('🔧 DEBUG - Timer główny będzie sprawdzał rezerwacje co 1 sekundę');
  console.log('📋 NOWE CZASY: oczekująca=15min, platnosc_w_toku=5min30s, P24=5min');
  
  // Uruchom timer do sprawdzania płatności co 5 sekund
  setInterval(checkPaymentStatuses, 5000); // 5000ms = 5 sekund
  console.log('Timer płatności uruchomiony (sprawdzanie co 5 sekund)');
});
