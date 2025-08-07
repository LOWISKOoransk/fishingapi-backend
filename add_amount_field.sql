-- Dodanie pola amount do tabeli reservations

-- Dodaj nową kolumnę amount
ALTER TABLE reservations ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 70.00;

-- Sprawdź czy zmiany zostały zastosowane
DESCRIBE reservations; 