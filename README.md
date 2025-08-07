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

## Wdrożenie na Render

1. Utwórz konto na render.com
2. Połącz z repozytorium Git
3. Ustaw zmienne środowiskowe w panelu Render
4. Deploy automatyczny przy push do main branch 