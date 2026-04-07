/**
 * PIX Payload Generator (Static/Manual)
 * Baseado no padrão EMV QRCPS (BR Code)
 * 
 * Gera códigos "Copia e Cola" para pagamento instantâneo.
 */

export interface PixConfig {
  key: string;
  receiverName: string;
  receiverCity: string;
  amount?: number;
  description?: string;
  transactionId?: string;
}

/**
 * Sanitiza strings para o padrão EMV (sem acentos, sem caracteres especiais)
 */
const sanitize = (str: string) => 
  str.normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "")
     .replace(/[^a-zA-Z0-9\s]/g, "")
     .toUpperCase();

export function generatePixPayload({
  key,
  receiverName,
  receiverCity,
  amount,
  description,
  transactionId = 'LTVBOOST'
}: PixConfig): string {
  const cleanName = sanitize(receiverName).substring(0, 25);
  const cleanCity = sanitize(receiverCity).substring(0, 15);
  const cleanDesc = description ? sanitize(description) : '';
  
  // Funções auxiliares para formatar os campos (ID + Tamanho + Valor)
  const f = (id: string, val: string) => `${id}${String(val.length).padStart(2, '0')}${val}`;
  
  // 00: Payload Format Indicator
  let payload = f('00', '01');
  
  // 26: Merchant Account Information (GUI + Chave)
  const gui = f('00', 'br.gov.bcb.pix');
  const keyField = f('01', key);
  const descField = cleanDesc ? f('02', cleanDesc) : '';
  payload += f('26', `${gui}${keyField}${descField}`);
  
  // 52: Merchant Category Code
  payload += f('52', '0000');
  
  // 53: Transaction Currency (BRL = 986)
  payload += f('53', '986');
  
  // 54: Transaction Amount
  if (amount) {
    payload += f('54', amount.toFixed(2));
  }
  
  // 58: Country Code
  payload += f('58', 'BR');
  
  // 59: Merchant Name
  payload += f('59', cleanName);
  
  // 60: Merchant City
  payload += f('60', cleanCity);
  
  // 62: Additional Data Field (Transaction ID)
  payload += f('62', f('05', transactionId.substring(0, 25)));
  
  // 63: CRC16 (Calculado ao final)
  payload += '6304';
  
  return `${payload}${calculateCRC16(payload)}`;
}

/**
 * Cálculo de CRC16 CCITT
 */
function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
