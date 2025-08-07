# Deployment Fix for path-to-regexp Error

## Problem
The backend was failing to deploy on Render with the error:
```
TypeError: Missing parameter name at 1: https://git.new/pathToRegexpError
```

## Root Cause
The issue was caused by:
1. **Polish characters in routes**: The route `/rezerwacja-błąd/:token` contained the Polish character "ł" which `path-to-regexp` couldn't parse properly
2. **Express 5.x compatibility**: Express 5.1.0 has stricter route parsing that was incompatible with Polish characters

## Solution Applied

### 1. Fixed Route Paths
- Changed `/rezerwacja-błąd/:token` to `/rezerwacja-error/:token` in both frontend and backend
- Updated all redirects to use ASCII characters only

### 2. Downgraded Express
- Changed Express from version `5.1.0` to `4.18.2` for better stability
- Express 4.x has better compatibility with international characters

### 3. Files Modified
- `src/App.tsx`: Updated route path
- `fishing-api/server.js`: Updated all redirect URLs
- `fishing-api/package.json`: Downgraded Express version

## Deployment Steps

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "Fix path-to-regexp error: remove Polish characters from routes and downgrade Express"
   git push origin main
   ```

2. **Redeploy on Render**:
   - The deployment should now succeed without the path-to-regexp error
   - Render will automatically install the correct Express version

3. **Verify deployment**:
   - Check that the backend starts successfully
   - Test the payment flow to ensure redirects work correctly

## Testing
Run the test server to verify routes work:
```bash
cd fishing-api
node test-route.js
```

Then test the endpoints:
- `GET /api/test`
- `GET /api/test/123`
- `GET /api/rezerwacja-error/test-token`

## Notes
- All Polish characters have been removed from URL paths
- The user experience remains the same, only the internal route names changed
- Express 4.18.2 is a stable, widely-used version
