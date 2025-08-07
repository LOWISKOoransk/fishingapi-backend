# Debugowanie problemów z Render

## 🔍 Sprawdź logi na Render

1. Przejdź do panelu Render
2. Wybierz swój serwis `lowisko-1`
3. Kliknij zakładkę "Logs"
4. Sprawdź błędy w logach

## 🚨 Najczęstsze problemy

### 1. Błąd 502 (Bad Gateway)
**Przyczyna:** Serwer nie może się uruchomić
**Rozwiązanie:**
- Sprawdź logi na Render
- Sprawdź zmienne środowiskowe
- Sprawdź połączenie z bazą danych

### 2. Błąd CORS
**Przyczyna:** Frontend nie może połączyć się z backendem
**Rozwiązanie:**
- Sprawdź czy domena frontendu jest w CORS
- Sprawdź czy backend działa

### 3. Błąd połączenia z bazą danych
**Przyczyna:** Brak zmiennych środowiskowych lub baza niedostępna
**Rozwiązanie:**
- Dodaj zmienne środowiskowe na Render:
  ```
  DB_HOST=twoj-host-mysql
  DB_USER=twoj-user-mysql
  DB_PASSWORD=twoje-haslo-mysql
  DB_NAME=fishing
  RESEND_API_KEY=re_fdKaJfQg_3rWdH2HSo9uoi33itgoGeU3s
  RECAPTCHA_SECRET_KEY=6Lcd3JYrAAAAAKUPrPnZrVbi2t3WZDht9PLCAAhY
  NODE_ENV=production
  ```

## 🧪 Testowanie

### 1. Health check
```bash
curl https://lowisko-1.onrender.com/health
```

### 2. Root endpoint
```bash
curl https://lowisko-1.onrender.com/
```

### 3. Test API
```bash
curl https://lowisko-1.onrender.com/api/spots
```

## 📋 Checklist

- [ ] Zmienne środowiskowe ustawione na Render
- [ ] Baza danych dostępna
- [ ] Serwer się uruchamia (sprawdź logi)
- [ ] Health check zwraca 200 OK
- [ ] CORS skonfigurowany
- [ ] Frontend łączy się z backendem

## 🔧 Zmienne środowiskowe

Upewnij się, że masz wszystkie te zmienne na Render:

```
DB_HOST=twoj-host-mysql
DB_USER=twoj-user-mysql
DB_PASSWORD=twoje-haslo-mysql
DB_NAME=fishing
RESEND_API_KEY=re_fdKaJfQg_3rWdH2HSo9uoi33itgoGeU3s
RECAPTCHA_SECRET_KEY=6Lcd3JYrAAAAAKUPrPnZrVbi2t3WZDht9PLCAAhY
NODE_ENV=production
```

## 📞 Kontakt

Jeśli problemy nadal występują:
1. Sprawdź logi na Render
2. Sprawdź czy baza danych działa
3. Sprawdź czy wszystkie zmienne środowiskowe są ustawione 