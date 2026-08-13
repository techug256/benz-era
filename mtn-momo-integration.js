/*
 BENZ ERA / MTN MoMo RequestToPay integration scaffold
 ------------------------------------------------------
 Keep all MTN credentials on the server. Never expose them to the browser.
 Required environment variables:
 MTN_BASE_URL, MTN_SUBSCRIPTION_KEY, MTN_API_USER, MTN_API_KEY,
 MTN_TARGET_ENVIRONMENT, MTN_CALLBACK_URL

 The frontend deposit.html expects:
 POST /api/payments/mtn/request-to-pay
 GET  /api/payments/mtn/status/:reference

 Implement these routes with the official MTN MoMo Uganda Collections API.
 The RequestToPay call is asynchronous: return the transaction/reference ID
 immediately, then confirm SUCCESSFUL status through the callback or polling
 before calling BenzEra.confirmDeposit() on the server-side database.

 This file is intentionally a scaffold because live merchant credentials and
 a public HTTPS callback URL are required for real-money transactions.
*/
