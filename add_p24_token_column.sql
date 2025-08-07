-- Dodaj kolumnę p24_token do tabeli reservations
ALTER TABLE reservations ADD COLUMN p24_token VARCHAR(255);

-- Sprawdź czy kolumna została dodana
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'reservations' 
AND COLUMN_NAME = 'p24_token'; 