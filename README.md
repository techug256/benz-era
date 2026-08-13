# Benz Era Connected Site

Pages are normalized to:
index, login, register, profile, personal-information, security,
wallet-management, deposit, withdraw, orders, team, promotion.

The shared `assets/js/benz-era.js` provides a browser prototype data layer for:
- users/authentication
- mandatory referral validation
- referral relationships
- Mobile Money / USDT TRC20 payment methods
- deposits/withdrawals
- team listing

Referral links use `/register.html?ref=REFERRAL_CODE`.

For production, replace the localStorage implementation with a server/API and database.
Never store real passwords, payment credentials, PINs, seed phrases or private keys in localStorage.


## Updated wallet/VIP behaviour

- Deposit page now offers UGX 20,000, UGX 40,000, UGX 100,000, or a custom amount.
- The user supplies the phone number used for the deposit.
- The browser sends the request to `/api/payments/mtn/request-to-pay`; the server must initiate MTN MoMo RequestToPay.
- The customer approves the debit with their Mobile Money PIN on their phone. The PIN is never collected or stored by this website.
- The balance is credited only after the payment status is confirmed successful.
- Profile now shows an account-balance card.
- VIP purchases are deducted from the account balance and are blocked when the balance is below the VIP price.
- VIP daily profits are credited after midnight; if the account was offline at midnight, the next page load catches up missed eligible days.
- Current VIP daily rates follow the existing package benefit values: VIP 1 = 10%, VIP 2 = 15%, VIP 3 = 18%, VIP 4 = 20%, with 90-day validity.
- For real payments, complete the MTN MoMo backend integration in `server/mtn-momo-integration.js` and use a real database/server-side ledger.

Important: the existing front-end is a prototype and should not be used as the financial source of truth for real money.
