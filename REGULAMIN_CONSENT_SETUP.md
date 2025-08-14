# System Przechowywania Zgód Regulaminu - Instrukcja Wdrożenia

## Opis

System został rozszerzony o możliwość przechowywania informacji o akceptacji regulaminu przez użytkowników podczas rezerwacji stanowisk wędkarskich. Jest to wymagane przez prawo i zapewnia zgodność z przepisami RODO.

## Zmiany w Bazie Danych

### 1. Nowe Pole w Tabeli `reservations`

Dodano pole `regulamin_consent` typu BOOLEAN:

```sql
ALTER TABLE reservations 
ADD COLUMN regulamin_consent BOOLEAN NOT NULL DEFAULT FALSE 
COMMENT 'Czy użytkownik zaakceptował regulamin';
```

### 2. Indeks dla Wydajności

```sql
CREATE INDEX idx_reservations_regulamin_consent ON reservations(regulamin_consent);
```

## Wdrożenie

### Krok 1: Aktualizacja Bazy Danych

Uruchom skrypt SQL na serwerze bazy danych:

```bash
# Opcja 1: Bezpośrednio przez MySQL
mysql -u username -p database_name < add_regulamin_consent.sql

# Opcja 2: Przez phpMyAdmin
# Skopiuj zawartość pliku add_regulamin_consent.sql i wykonaj
```

### Krok 2: Restart Backendu

Po aktualizacji bazy danych, zrestartuj backend:

```bash
# Na serwerze Render
# Backend automatycznie się zrestartuje po push do repozytorium

# Lub ręcznie przez panel Render
```

### Krok 3: Weryfikacja

Sprawdź czy system działa poprawnie:

1. **Test Rezerwacji**: Spróbuj utworzyć rezerwację bez zaznaczenia checkboxa regulaminu
2. **Sprawdź Logi**: W logach backendu powinien pojawić się błąd o braku akceptacji regulaminu
3. **Sprawdź Bazę**: Nowe rezerwacje powinny mieć ustawione `regulamin_consent = 1`

## Nowe Endpointy API

### 1. Pobieranie Wszystkich Zgód (Admin)

```
GET /api/regulamin-consents
Authorization: Bearer <admin_token>
```

**Odpowiedź:**
```json
[
  {
    "id": 1,
    "first_name": "Jan",
    "last_name": "Kowalski",
    "email": "jan@example.com",
    "regulamin_consent": true,
    "created_at": "2025-01-15T10:30:00.000Z",
    "status": "opłacona",
    "spot_name": "Stanowisko 1"
  }
]
```

### 2. Szczegóły Zgody (Admin)

```
GET /api/regulamin-consents/:id
Authorization: Bearer <admin_token>
```

### 3. Statystyki Zgód (Admin)

```
GET /api/regulamin-consents/stats
Authorization: Bearer <admin_token>
```

**Odpowiedź:**
```json
{
  "total_reservations": 150,
  "accepted_consents": 148,
  "missing_consents": 2,
  "consent_percentage": 98.67
}
```

## Walidacja w Backendzie

### Sprawdzanie Zgody

Backend automatycznie sprawdza czy użytkownik zaakceptował regulamin:

```javascript
// Sprawdź czy użytkownik zaakceptował regulamin
if (!regulamin_consent) {
  return res.status(400).json({ 
    error: 'Aby zarezerwować stanowisko, musisz zaakceptować regulamin.' 
  });
}
```

### Zapisywanie w Bazie

Pole `regulamin_consent` jest zapisywane w bazie danych:

```javascript
const [result] = await dbPool.query(
  `INSERT INTO reservations (..., regulamin_consent) VALUES (..., ?)`,
  [..., regulamin_consent]
);
```

## Frontend

### Checkbox Regulaminu

Frontend już zawiera checkbox regulaminu w formularzu rezerwacji:

```typescript
const [acceptRegulamin, setAcceptRegulamin] = useState(false);

// W formularzu
<input
  type="checkbox"
  id="acceptRegulamin"
  checked={acceptRegulamin}
  onChange={e => setAcceptRegulamin(e.target.checked)}
  required
/>
```

### Wysyłanie do Backendu

Pole `regulamin_consent` jest automatycznie wysyłane do backendu:

```typescript
const requestBody = {
  // ... inne pola
  regulamin_consent: acceptRegulamin,
};
```

## Zgodność z Prawem

### RODO

- **Podstawa Prawna**: Art. 6 ust. 1 lit. a) RODO - zgoda osoby, której dane dotyczą
- **Cel Przetwarzania**: Realizacja umowy rezerwacji stanowiska
- **Okres Przechowywania**: Do momentu wygaśnięcia umowy + okres archiwizacyjny

### Ustawa o Ochronie Danych Osobowych

- Zgoda na regulamin jest warunkiem zawarcia umowy
- Użytkownik musi zostać poinformowany o konsekwencjach braku zgody
- Zgoda może być w każdej chwili cofnięta (ale oznacza to rezygnację z rezerwacji)

## Monitoring i Raporty

### Logi Backendu

Wszystkie operacje związane z regulaminem są logowane:

```
🔍 DEBUG REZERWACJA - DANE WEJŚCIOWE:
regulamin_consent: true
```

### Statystyki dla Adminów

Admin może monitorować:
- Liczbę wszystkich rezerwacji
- Liczbę zaakceptowanych regulaminów
- Procent zgodności
- Rezerwacje bez akceptacji regulaminu

## Rozwiązywanie Problemów

### Błąd: "Brak wymaganych danych"

**Przyczyna**: Pole `regulamin_consent` nie zostało wysłane z frontendu

**Rozwiązanie**: Sprawdź czy frontend wysyła pole `regulamin_consent: true/false`

### Błąd: "Aby zarezerwować stanowisko, musisz zaakceptować regulamin"

**Przyczyna**: Użytkownik nie zaznaczył checkboxa regulaminu

**Rozwiązanie**: To jest prawidłowe zachowanie - użytkownik musi zaakceptować regulamin

### Błąd SQL: "Unknown column 'regulamin_consent'"

**Przyczyna**: Pole nie zostało dodane do bazy danych

**Rozwiązanie**: Uruchom skrypt `add_regulamin_consent.sql`

## Testowanie

### Scenariusz 1: Poprawna Rezerwacja z Regulaminem

1. Zaznacz checkbox regulaminu
2. Wypełnij formularz
3. Wyślij rezerwację
4. Sprawdź w bazie: `regulamin_consent = 1`

### Scenariusz 2: Rezerwacja bez Regulaminu

1. Nie zaznaczaj checkboxa regulaminu
2. Wypełnij formularz
3. Wyślij rezerwację
4. Otrzymaj błąd: "Aby zarezerwować stanowisko, musisz zaakceptować regulamin"

### Scenariusz 3: Sprawdzenie Statystyk

1. Zaloguj się jako admin
2. Wywołaj `/api/regulamin-consents/stats`
3. Sprawdź czy statystyki są poprawne

## Bezpieczeństwo

### Walidacja Po Stronie Serwera

- Backend zawsze sprawdza pole `regulamin_consent`
- Nie można obejść walidacji frontendu
- Wszystkie rezerwacje muszą mieć ustawione to pole

### Dostęp do Endpointów

- Endpointy statystyk wymagają autoryzacji admina
- Zwykli użytkownicy nie mają dostępu do danych o zgodach innych osób

## Wsparcie

W przypadku problemów:

1. Sprawdź logi backendu
2. Sprawdź strukturę bazy danych
3. Zweryfikuj czy frontend wysyła poprawne dane
4. Skontaktuj się z zespołem deweloperskim

---

**Data utworzenia**: 15.01.2025  
**Wersja**: 1.0  
**Autor**: System Administrator
