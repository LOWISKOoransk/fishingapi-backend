-- Skrypt migracji istniejących rezerwacji
-- Uruchom po dodaniu pola regulamin_consent do tabeli reservations

-- Aktualizuj istniejące rezerwacje, ustawiając regulamin_consent = TRUE
-- Zakładamy, że wszystkie istniejące rezerwacje zostały utworzone przed wprowadzeniem wymogu akceptacji regulaminu
-- Więc ustawiamy je jako "zaakceptowane" (TRUE)

UPDATE reservations 
SET regulamin_consent = TRUE 
WHERE regulamin_consent IS NULL OR regulamin_consent = FALSE;

-- Sprawdź wynik migracji
SELECT 
    COUNT(*) as total_reservations,
    SUM(CASE WHEN regulamin_consent = 1 THEN 1 ELSE 0 END) as accepted_consents,
    SUM(CASE WHEN regulamin_consent = 0 THEN 1 ELSE 0 END) as missing_consents,
    ROUND((SUM(CASE WHEN regulamin_consent = 1 THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) as consent_percentage
FROM reservations;

-- Pokaż kilka przykładów zaktualizowanych rezerwacji
SELECT 
    id,
    first_name,
    last_name,
    email,
    regulamin_consent,
    created_at,
    status
FROM reservations 
ORDER BY created_at DESC 
LIMIT 10;

-- Sprawdź czy wszystkie rezerwacje mają ustawione regulamin_consent
SELECT 
    CASE 
        WHEN COUNT(*) = SUM(CASE WHEN regulamin_consent IS NOT NULL THEN 1 ELSE 0 END) 
        THEN '✅ Wszystkie rezerwacje mają ustawione regulamin_consent'
        ELSE '❌ Niektóre rezerwacje nie mają ustawionego regulamin_consent'
    END as migration_status
FROM reservations;
