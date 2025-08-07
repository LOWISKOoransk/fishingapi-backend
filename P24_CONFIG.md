# Konfiguracja Przelewy24

## Dane testowe (sandbox)

Aby używać testowych płatności Przelewy24, użyj następujących danych:

```javascript
const P24_CONFIG = {
  merchantId: 123456, // Twój merchant ID
  posId: 123456, // Twój pos ID  
  apiKey: 'test_api_key', // Twój API key
  crc: 'test_crc_key', // Twój CRC key
  sandbox: true, // true dla testów
  baseUrl: 'https://sandbox.przelewy24.pl'
};
```

## Dane produkcyjne

Aby przejść na prawdziwe płatności, zmień konfigurację w `server.js`:

```javascript
const P24_CONFIG = {
  merchantId: YOUR_MERCHANT_ID, // Z panelu Przelewy24
  posId: YOUR_POS_ID, // Z panelu Przelewy24
  apiKey: 'YOUR_API_KEY', // Z panelu Przelewy24
  crc: 'YOUR_CRC_KEY', // Z panelu Przelewy24
  sandbox: false, // false dla produkcji
  baseUrl: 'https://secure.przelewy24.pl'
};
```

## Jak uzyskać dane z Przelewy24:

1. **Zaloguj się do panelu Przelewy24**
2. **Przejdź do ustawień** → **API**
3. **Skopiuj dane:**
   - Merchant ID
   - Pos ID  
   - API Key
   - CRC Key

## Callback URL

W panelu Przelewy24 ustaw callback URL na:
```
http://twoja-domena.pl/api/payment/p24/status
```

## Testowanie

1. Utwórz rezerwację na stronie
2. Kliknij "OPŁAĆ TERAZ"
3. Przejdziesz do testowej strony Przelewy24
4. Kliknij "Symuluj udaną płatność Przelewy24"
5. Status rezerwacji zmieni się na "opłacona"

## Produkcja

Aby przejść na prawdziwe płatności:
1. Zmień `sandbox: false` w konfiguracji
2. Wstaw prawdziwe dane z panelu Przelewy24
3. Zmień `baseUrl` na `https://secure.przelewy24.pl`
4. Odkomentuj kod w `createP24Payment()` funkcji 