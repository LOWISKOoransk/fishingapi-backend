# 📥 Instrukcje Importu Tabeli Trybu Technicznego

## 🗄️ Sposoby importu tabeli `system_config`

### **Metoda 1: Przez wiersz poleceń MySQL**

```bash
# Połącz się z bazą danych
mysql -u [username] -p [database_name]

# Wykonaj plik SQL
source /ścieżka/do/import_maintenance_table.sql;

# Lub bezpośrednio:
mysql -u [username] -p [database_name] < import_maintenance_table.sql
```

### **Metoda 2: Przez phpMyAdmin**

1. **Zaloguj się do phpMyAdmin**
2. **Wybierz bazę danych** (lewy panel)
3. **Kliknij zakładkę "SQL"**
4. **Skopiuj i wklej zawartość pliku `import_maintenance_table.sql`**
5. **Kliknij "Wykonaj"**

### **Metoda 3: Przez HeidiSQL (Windows)**

1. **Połącz się z bazą danych**
2. **Kliknij prawym na bazę → "Uruchom plik SQL"**
3. **Wybierz plik `import_maintenance_table.sql`**
4. **Kliknij "Start"**

### **Metoda 4: Przez MySQL Workbench**

1. **Połącz się z serwerem MySQL**
2. **Wybierz schemat (bazę danych)**
3. **Otwórz plik `import_maintenance_table.sql`**
4. **Kliknij ikonę błyskawicy (Execute)**

## 🔧 Sprawdzenie czy import się udał

### **Po imporcie wykonaj te zapytania:**

```sql
-- Sprawdź czy tabela istnieje
SHOW TABLES LIKE 'system_config';

-- Sprawdź strukturę tabeli
DESCRIBE system_config;

-- Sprawdź dane
SELECT * FROM system_config;

-- Sprawdź status trybu technicznego
SELECT 
  key_name,
  value,
  CASE 
    WHEN key_name = 'maintenance_mode' AND value = 'true' THEN '🔴 WŁĄCZONY'
    WHEN key_name = 'maintenance_mode' AND value = 'false' THEN '🟢 WYŁĄCZONY'
    WHEN key_name = 'maintenance_password' THEN '🔐 HASŁO USTAWIONE'
    ELSE '❓ NIEZNANE'
  END as status
FROM system_config;
```

## 🚨 Rozwiązywanie problemów

### **Problem: "Access denied"**
```bash
# Sprawdź uprawnienia użytkownika
SHOW GRANTS FOR 'username'@'localhost';

# Jeśli brak uprawnień, dodaj je:
GRANT ALL PRIVILEGES ON database_name.* TO 'username'@'localhost';
FLUSH PRIVILEGES;
```

### **Problem: "Table already exists"**
```sql
-- Usuń istniejącą tabelę i utwórz ponownie
DROP TABLE IF EXISTS system_config;
-- Następnie wykonaj ponownie import_maintenance_table.sql
```

### **Problem: "Unknown database"**
```bash
# Sprawdź dostępne bazy danych
SHOW DATABASES;

# Utwórz bazę jeśli nie istnieje
CREATE DATABASE IF NOT EXISTS [nazwa_bazy];
USE [nazwa_bazy];
```

## 📋 Wymagania systemowe

- **MySQL**: 5.7+ lub 8.0+
- **Uprawnienia**: CREATE, INSERT, SELECT, UPDATE na bazie danych
- **Kodowanie**: UTF-8 (utf8mb4)

## ✅ Po udanym imporcie

1. **Sprawdź czy tabela została utworzona**
2. **Sprawdź czy dane zostały wstawione**
3. **Restartuj backend** (`node server.js`)
4. **Przetestuj endpointy:**
   - `GET /api/maintenance/status`
   - `POST /api/maintenance/verify`

## 🎯 Gotowe!

Po udanym imporcie będziesz mieć:
- ✅ Tabelę `system_config` w bazie danych
- ✅ Tryb techniczny domyślnie WYŁĄCZONY
- ✅ Hasło techniczne: `Wysocka11223344`
- ✅ Gotowy system do zarządzania dostępem do strony
