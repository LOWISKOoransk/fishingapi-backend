-- Aktualizacja tabeli spot_blocks - usunięcie kolumny hour, zostawienie tylko date
-- (blokujemy całe dni, nie godziny)

-- Usuń kolumnę hour z tabeli spot_blocks
ALTER TABLE spot_blocks DROP COLUMN hour;

-- Sprawdź czy zmiany zostały zastosowane
DESCRIBE spot_blocks;