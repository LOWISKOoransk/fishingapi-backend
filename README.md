# Fishing API

Backend API dla systemu rezerwacji łowiska.

## Instalacja

```bash
npm install
```

## Uruchomienie lokalne

```bash
npm run dev
```

## Zmienne środowiskowe

- `DB_HOST` - Host bazy danych MySQL
- `DB_USER` - Użytkownik bazy danych
- `DB_PASSWORD` - Hasło do bazy danych
- `DB_NAME` - Nazwa bazy danych
- `RESEND_API_KEY` - Klucz API Resend do wysyłania emaili
- `FRONTEND_URL` - Publiczny URL frontendu (HTTPS)
- `BACKEND_URL` - Publiczny URL backendu (HTTPS)

### Przelewy24 (z produkcji ustaw w Render)
- `P24_MERCHANT_ID`
- `P24_POS_ID`
- `P24_API_KEY`
- `P24_CRC`
- `P24_SECRET_ID` (alias `P24_REPORT_KEY`)
- `P24_SANDBOX` (`true`/`false`)
- `P24_BASE_URL` (opcjonalnie; jeśli pominięte, wybiera się na podstawie `P24_SANDBOX`)

## Wdrożenie na Render

1. Utwórz konto na render.com
2. Połącz z repozytorium Git
3. Ustaw zmienne środowiskowe w panelu Render
4. Deploy automatyczny przy push do main branch 

## Bezpieczeństwo

- Nie commituj prawdziwych kluczy P24 do repozytorium. Używaj zmiennych środowiskowych.
- Pozostawienie `P24_SANDBOX=false` i `P24_BASE_URL=https://secure.przelewy24.pl/api/v1` w produkcji jest wymagane.