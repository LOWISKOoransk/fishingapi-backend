# Debugowanie problemów z płatnościami

## 🔍 Problem z błędem 502 i CORS

### Przyczyna:
- Serwer na Render czasami nie odpowiada (timeout)
- Błąd 502 (Bad Gateway) oznacza problem z serwerem
- CORS blokuje żądania z frontendu

### Rozwiązanie:
1. **Dodano timeouty** - Endpointy mają teraz timeout 25-30 sekund
2. **Lepsze logowanie** - Więcej logów do debugowania
3. **Obsługa błędów** - Lepsze komunikaty błędów

## 🧪 Testowanie

### 1. Test połączenia z bazą
```bash
cd fishing-api
npm run test-connection
```

### 2. Test płatności
```bash
cd fishing-api
npm run test-payment
```

### 3. Test health check
```bash
curl https://lowisko-1.onrender.com/health
```

## 📋 Checklist płatności

- [ ] Baza danych działa (test-connection)
- [ ] Serwer odpowiada (health check)
- [ ] Płatność się tworzy (test-payment)
- [ ] Przelewy24 odpowiada
- [ ] Callback działa
- [ ] Polling działa

## 🚨 Najczęstsze problemy

### 1. Błąd 502 (Bad Gateway)
**Przyczyna:** Serwer na Render nie odpowiada
**Rozwiązanie:**
- Sprawdź logi na Render
- Sprawdź czy baza danych działa
- Sprawdź zmienne środowiskowe

### 2. Timeout podczas płatności
**Przyczyna:** Przelewy24 nie odpowiada w czasie
**Rozwiązanie:**
- Sprawdź konfigurację Przelewy24
- Sprawdź połączenie internetowe
- Spróbuj ponownie

### 3. CORS błąd
**Przyczyna:** Frontend nie może połączyć się z backendem
**Rozwiązanie:**
- Sprawdź czy backend działa
- Sprawdź konfigurację CORS
- Sprawdź URL w config.ts

## 🔧 Konfiguracja Przelewy24

Sprawdź czy masz poprawne dane w `server.js`:

```javascript
const P24_CONFIG = {
  merchantId: 353899,
  posId: 353899,
  apiKey: 'c87d5e5e',
  crc: '7b524bd130131923',
  reportKey: '8ba2af407cdcea7d7a3e7e90cd404389',
  sandbox: true,
  baseUrl: 'https://sandbox.przelewy24.pl/api/v1'
};
```

## 📞 Logi do sprawdzenia

1. **Na Render:** Sprawdź logi w panelu Render
2. **Lokalnie:** Uruchom `npm run dev` i sprawdź logi
3. **W przeglądarce:** Sprawdź Console (F12)

## 🎯 Następne kroki

1. Wdróż zmiany na Render
2. Przetestuj płatność
3. Sprawdź logi
4. Jeśli problemy nadal występują, sprawdź:
   - Logi na Render
   - Połączenie z bazą danych
   - Konfigurację Przelewy24 