-- Dodanie pola regulamin_consent do tabeli reservations
-- To pole będzie przechowywać informację o akceptacji regulaminu przez użytkownika

ALTER TABLE reservations 
ADD COLUMN regulamin_consent BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Czy użytkownik zaakceptował regulamin';

-- Dodanie indeksu dla lepszej wydajności zapytań
CREATE INDEX idx_reservations_regulamin_consent ON reservations(regulamin_consent);

-- Aktualizacja komentarza tabeli
ALTER TABLE reservations COMMENT = 'Rezerwacje stanowisk z informacją o akceptacji regulaminu';

-- Sprawdzenie czy zmiana została zastosowana
SELECT 'Pole regulamin_consent zostało dodane do tabeli reservations' as status;
DESCRIBE reservations;
