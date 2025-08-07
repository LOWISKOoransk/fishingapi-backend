-- Aktualizacja bazy danych - nowe statusy rezerwacji
-- Dodaj nowe statusy do tabeli reservations

-- Aktualizuj komentarze w tabeli reservations
ALTER TABLE reservations MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'oczekująca' 
COMMENT 'Statusy: oczekująca, platnosc_w_toku, opłacona, nieoplacona, anulowana, zwrot, zwrot_zgloszony, anulowana_admin, zwrot_zrealizowany, zwrot_admin_zrealizowany';

-- Dodaj nowe statusy do bazy (są już obsługiwane przez aplikację)
-- Nowe statusy:
-- - zwrot_zgloszony: użytkownik zgłosił zwrot
-- - anulowana_admin: admin anulował rezerwację
-- - zwrot_zrealizowany: admin zrealizował zwrot użytkownika
-- - zwrot_admin_zrealizowany: admin zrealizował zwrot po anulacji 