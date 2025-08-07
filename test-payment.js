// Test płatności Przelewy24
require('dotenv').config();
const fetch = require('node-fetch');

async function testPayment() {
  console.log('🧪 Testowanie płatności Przelewy24...');
  
  const testData = {
    sessionId: `test_${Date.now()}`,
    amount: 7000, // 70 zł w groszach
    description: 'Test płatności - Łowisko Młyn Rańsk',
    email: 'test@example.com',
    client: 'Test User',
    token: 'test-token-123'
  };
  
  try {
    console.log('📤 Wysyłam żądanie płatności...');
    console.log('📦 Dane testowe:', testData);
    
    const response = await fetch('https://lowisko-1.onrender.com/api/create-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log('📡 Status odpowiedzi:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Płatność utworzona pomyślnie:');
      console.log('   Token:', data.token);
      console.log('   URL płatności:', data.paymentUrl);
      console.log('   Success:', data.success);
    } else {
      const errorData = await response.json();
      console.log('❌ Błąd płatności:');
      console.log('   Status:', response.status);
      console.log('   Error:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas testowania płatności:', error.message);
  }
}

testPayment(); 