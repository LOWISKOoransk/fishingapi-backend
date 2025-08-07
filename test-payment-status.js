// Konfiguracja Przelewy24 (testowe dane)
const P24_CONFIG = {
  merchantId: 353899,
  posId: 353899,
  apiKey: 'c87d5e5e',
  crc: '7b524bd130131923',
  reportKey: '8ba2af407cdcea7d7a3e7e90cd404389',
  sandbox: true,
  baseUrl: 'https://sandbox.przelewy24.pl/api/v1'
};

async function testPaymentStatus() {
  const paymentId = 'res_161_1754047386352';
  
  try {
    console.log('🔍 Sprawdzam status płatności w Przelewy24...');
    console.log('Payment ID:', paymentId);
    
    const auth = Buffer.from(`${P24_CONFIG.posId}:${P24_CONFIG.reportKey}`).toString('base64');
    
    const response = await fetch(`${P24_CONFIG.baseUrl}/transaction/status/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });
    
    console.log('📡 Status odpowiedzi z Przelewy24:', response.status);
    
    if (response.status === 200) {
      const paymentData = await response.json();
      console.log('📊 Status płatności z Przelewy24:');
      console.log(JSON.stringify(paymentData, null, 2));
      
      if (paymentData.data && paymentData.data.status === 1) {
        console.log('✅ Płatność potwierdzona!');
      } else {
        console.log('❌ Płatność nie została zrealizowana (status:', paymentData.data?.status, ')');
      }
    } else {
      console.log('❌ Błąd podczas sprawdzania statusu płatności');
      const errorData = await response.text();
      console.log('Błąd:', errorData);
    }
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania statusu płatności:', error);
  }
}

testPaymentStatus(); 