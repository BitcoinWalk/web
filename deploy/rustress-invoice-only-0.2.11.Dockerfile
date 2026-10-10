FROM bitcoinwalk-rustress-payout:0.2.10
COPY rustress-payout-service-0.2.11.cjs /app/rustress-payout-service.cjs
LABEL org.bitcoinwalk.version="0.2.11" org.bitcoinwalk.mode="invoice-only"
