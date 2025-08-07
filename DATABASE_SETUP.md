# 🗄️ Konfiguracja bazy danych

## 📋 **Kroki do wykonania:**

### **1. Utwórz bazę MySQL na lh.pl:**

1. **Zaloguj się na panel lh.pl**
2. **Przejdź do sekcji "Bazy danych"**
3. **Utwórz nową bazę MySQL**
4. **Zapisz dane połączenia:**
   - Host: `twoj-host.lh.pl`
   - Użytkownik: `twoj-uzytkownik`
   - Hasło: `twoje-haslo`
   - Nazwa bazy: `fishing`

### **2. Zaimportuj strukturę bazy:**

1. **Otwórz phpMyAdmin** (jeśli dostępne) lub **panel bazy danych**
2. **Wybierz utworzoną bazę `fishing`**
3. **Przejdź do zakładki "Import"**
4. **Wybierz plik `complete_database.sql`**
5. **Kliknij "Wykonaj"**

### **3. Skonfiguruj zmienne środowiskowe na Render:**

1. **Przejdź do dashboardu Render**
2. **Wybierz swój serwis `fishingapi`**
3. **Przejdź do zakładki "Environment"**
4. **Dodaj następujące zmienne:**

```
DB_HOST=twoj-host.lh.pl
DB_USER=twoj-uzytkownik
DB_PASSWORD=twoje-haslo
DB_NAME=fishing
NODE_ENV=production
RESEND_API_KEY=re_fdKaJfQg_3rWdH2HSo9uoi33itgoGeU3s
```

### **4. Sprawdź połączenie:**

Po skonfigurowaniu, Render automatycznie uruchomi nowy deployment. Sprawdź logi - powinny pokazywać:

```
✅ Połączenie z bazą danych udane
```

## 🔧 **Troubleshooting:**

### **Problem: "Access denied"**
- Sprawdź czy użytkownik ma uprawnienia do bazy
- Sprawdź czy host jest poprawny

### **Problem: "Database not found"**
- Sprawdź czy nazwa bazy jest poprawna
- Sprawdź czy baza została utworzona

### **Problem: "Connection timeout"**
- Sprawdź czy host jest dostępny z zewnątrz
- Sprawdź czy port 3306 jest otwarty

## 📊 **Struktura bazy:**

### **Tabela `spots`:**
- `id` - ID stanowiska
- `name` - Nazwa stanowiska
- `is_active` - Czy aktywne

### **Tabela `reservations`:**
- `id` - ID rezerwacji
- `first_name`, `last_name` - Dane klienta
- `phone`, `email`, `car_plate` - Kontakt
- `spot_id` - ID stanowiska
- `date`, `end_date` - Termin pobytu
- `status` - Status rezerwacji
- `token` - Unikalny token
- `amount` - Kwota
- `payment_id`, `p24_token` - Dane płatności

### **Tabela `spot_blocks`:**
- `spot_id` - ID stanowiska
- `date` - Data blokady
- `source` - Źródło blokady (admin/reservation/paid_reservation)

## ✅ **Po skonfigurowaniu:**

Backend powinien uruchomić się poprawnie i wszystkie funkcje będą działać:
- Rezerwacje stanowisk
- Płatności Przelewy24
- Wysyłanie emaili
- Panel administracyjny
