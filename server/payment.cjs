// Replaceable payment boundary. No public payment or receipt-confirmation endpoint.
module.exports = {
  mode: 'manual',
  confirmReceipt(domain,id,input) { return domain.manage(id,{...input,action:'confirmReceipt'},'authenticated-admin'); },
  recordRefund(domain,id,input) { return domain.manage(id,{...input,action:'refund'},'authenticated-admin'); },
  async verifyProviderNotification() { const e=new Error('正式渠道未接入，不能接受支付通知');e.status=503;throw e; }
};
// Future provider adapter must verify signature/decryption, merchant identity,
// order ID, amount/currency and successful provider transaction status before updating records.
