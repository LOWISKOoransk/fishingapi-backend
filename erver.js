[1mdiff --git a/server.js b/server.js[m
[1mindex 47465bd..c749085 100644[m
[1m--- a/server.js[m
[1m+++ b/server.js[m
[36m@@ -182,7 +182,7 @@[m [masync function testP24Connection() {[m
       console.log('⚠️ Nie udało się sprawdzić IP:', ipError.message);[m
     }[m
     [m
[31m-    const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');[m
[32m+[m[32m    const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64');[m
     console.log('Authorization:', `Basic ${auth}`);[m
     [m
     const response = await fetch(`${P24_CONFIG.baseUrl}/testAccess`, {[m
[36m@@ -376,7 +376,7 @@[m [masync function verifyTransaction(sessionId, orderId, amount, currency = 'PLN') {[m
     method: 'PUT',[m
     headers: {[m
       'Content-Type': 'application/json',[m
[31m-      'Authorization': `Basic ${Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64')}`[m
[32m+[m[32m      'Authorization': `Basic ${Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64')}`[m
     },[m
     body: JSON.stringify(verificationData)[m
   });[m
[36m@@ -432,10 +432,26 @@[m [masync function createP24Payment(reservation, amount) {[m
       amount_grosz: amountInGrosz,[m
       currency: 'PLN'[m
     });[m
[32m+[m[41m    [m
[32m+[m[32m    // DEBUG AUTORYZACJA P24[m
[32m+[m[32m    console.log('🔐 DEBUG P24 AUTH:', {[m
[32m+[m[32m      posId: P24_CONFIG.posId,[m
[32m+[m[32m      posIdType: typeof P24_CONFIG.posId,[m
[32m+[m[32m      posIdAsNumber: Number(P24_CONFIG.posId),[m
[32m+[m[32m      reportKey: P24_CONFIG.reportKey ? `${P24_CONFIG.reportKey.substring(0, 8)}...` : 'BRAK',[m
[32m+[m[32m      reportKeyLength: P24_CONFIG.reportKey ? P24_CONFIG.reportKey.length : 0,[m
[32m+[m[32m      baseUrl: P24_CONFIG.baseUrl,[m
[32m+[m[32m      sandbox: P24_CONFIG.sandbox[m
[32m+[m[32m    });[m
[32m+[m[41m    [m
     // Użyj nowego API /api/v1/transaction/register[m
[31m-    const authString = `${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`;[m
[32m+[m[32m    // Upewnij się że posId jest liczbą (nie stringiem)[m
[32m+[m[32m    const authString = `${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`;[m
     const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;[m
     [m
[32m+[m[32m    console.log('🔐 AUTH STRING:', authString.replace(P24_CONFIG.reportKey, '***HIDDEN***'));[m
[32m+[m[32m    console.log('🔐 AUTH HEADER:', authHeader.substring(0, 20) + '...');[m
[32m+[m[41m    [m
     const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/register`, {[m
       method: 'POST',[m
       headers: { [m
[36m@@ -450,7 +466,12 @@[m [masync function createP24Payment(reservation, amount) {[m
     // Sprawdź odpowiedź[m
     if (response.status !== 200) {[m
       const errorData = await response.json();[m
[31m-      logger.error('P24 register fail', { sessionId, status: response.status, error: errorData.error || 'Unknown' });[m
[32m+[m[32m      console.log('❌ P24 ERROR RESPONSE:', {[m
[32m+[m[32m        status: response.status,[m
[32m+[m[32m        headers: Object.fromEntries(response.headers.entries()),[m
[32m+[m[32m        errorData: errorData[m
[32m+[m[32m      });[m
[32m+[m[32m      logger.error('P24 register fail', { sessionId, status: response.status, error: errorData.error || 'Unknown', fullError: errorData });[m
       try { metrics.p24.errors++; } catch {}[m
       throw new Error(`Błąd Przelewy24: ${errorData.error || 'Nieznany błąd'}`);[m
     }[m
[36m@@ -486,7 +507,7 @@[m [masync function checkPaymentStatuses() {[m
         // Sprawdź status płatności w Przelewy24 jeśli jest payment_id[m
         if (reservation.payment_id) {[m
           try {[m
[31m-            const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');[m
[32m+[m[32m            const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64');[m
             [m
             const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/status/${reservation.payment_id}`, {[m
               method: 'GET',[m
[36m@@ -2122,7 +2143,7 @@[m [mapp.get('/api/reservations/token/:token', async (req, res) => {[m
       [m
       // Sprawdź status płatności w Przelewy24 (dla sandboxa)[m
       try {[m
[31m-        const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');[m
[32m+[m[32m        const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64');[m
         [m
         // Użyj sessionId do sprawdzania statusu (prawidłowy endpoint)[m
         const sessionId = reservation.payment_id;[m
[36m@@ -3292,7 +3313,7 @@[m [mapp.post('/api/create-payment', async (req, res) => {[m
     // Generuj podpis dla rejestracji[m
     const sign = calculateRegistrationSign(uniqueSessionId, amount, currency);[m
 [m
[31m-  const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString("base64");[m
[32m+[m[32m  const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString("base64");[m
 [m
     console.log('🔐 Dane autoryzacji:', {[m
       posId: P24_CONFIG.posId,[m
[36m@@ -3522,7 +3543,7 @@[m [mapp.get('/api/rezerwacja/:token', async (req, res) => {[m
       [m
       // Sprawdź status płatności w Przelewy24 (dla sandboxa)[m
       try {[m
[31m-        const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');[m
[32m+[m[32m        const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64');[m
         [m
         // Użyj p24_token jeśli istnieje, w przeciwnym razie użyj payment_id (fallback dla starych rezerwacji)[m
         const tokenToUse = reservation.p24_token || reservation.payment_id;[m
[36m@@ -3710,7 +3731,7 @@[m [mapp.get('/api/check-payment/:token', async (req, res) => {[m
     }[m
     [m
     // Sprawdź status w Przelewy24[m
[31m-    const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');[m
[32m+[m[32m    const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64');[m
     [m
     const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/status/${reservation.payment_id}`, {[m
       method: 'GET',[m
[36m@@ -4129,7 +4150,7 @@[m [mapp.get('/api/reservation/status/:token', async (req, res) => {[m
         const sessionId = reservation.payment_id;[m
         console.log('🔧 Polling - Używam sessionId:', sessionId);[m
         [m
[31m-        const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');[m
[32m+[m[32m        const auth = Buffer.from(`${Number(P24_CONFIG.posId)}:${P24_CONFIG.reportKey}`).toString('base64');[m
         // PRAWIDŁOWY endpoint do sprawdzania statusu[m
         const url = `${P24_CONFIG.baseUrl}/transaction/by/sessionId/${sessionId}`;[m
         [m
