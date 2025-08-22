-- =====================================================
-- IMPORT TABELI TRYBU TECHNICZNEGO
-- Łowisko Młyn Rańsk - System Konfiguracyjny
-- =====================================================

-- Upewnij się, że jesteś w odpowiedniej bazie danych
-- USE [nazwa_twojej_bazy];

-- Usuń tabelę jeśli istnieje (opcjonalnie - usuń komentarz jeśli chcesz)
-- DROP TABLE IF EXISTS system_config;

-- Utwórz tabelę system_config
CREATE TABLE IF NOT EXISTS system_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  key_name VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indeksy dla lepszej wydajności
  INDEX idx_key_name (key_name),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wstaw domyślne wartości konfiguracyjne
INSERT INTO system_config (key_name, value) VALUES 
  ('maintenance_mode', 'false'),
  ('maintenance_password', 'Wysocka11223344')
ON DUPLICATE KEY UPDATE 
  value = VALUES(value),
  updated_at = CURRENT_TIMESTAMP;

-- Sprawdź czy dane zostały wstawione poprawnie
SELECT 
  id,
  key_name,
  value,
  updated_at,
  CASE 
    WHEN key_name = 'maintenance_mode' THEN 
      CASE WHEN value = 'true' THEN '🔴 WŁĄCZONY' ELSE '🟢 WYŁĄCZONY' END
    WHEN key_name = 'maintenance_password' THEN 
      CASE WHEN value IS NOT NULL AND value != '' THEN '🔐 USTAWIONE' ELSE '❌ BRAK' END
    ELSE '❓ NIEZNANE'
  END as status
FROM system_config 
WHERE key_name IN ('maintenance_mode', 'maintenance_password')
ORDER BY id;

-- Pokaż informacje o tabeli
SHOW CREATE TABLE system_config;

-- Pokaż wszystkie rekordy w tabeli
SELECT * FROM system_config ORDER BY id;

-- =====================================================
-- INFORMACJE O IMPORCIE
-- =====================================================
-- 
-- ✅ Tabela została utworzona pomyślnie
-- ✅ Domyślne wartości zostały wstawione
-- ✅ Tryb techniczny jest domyślnie WYŁĄCZONY
-- ✅ Hasło techniczne: Wysocka11223344
-- 
-- =====================================================
