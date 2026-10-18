FROM bitcoinwalk-rustress-payout:0.2.17
COPY rustress-payout-service-0.2.18.cjs /app/rustress-payout-service.cjs
COPY verify-rustress-payout-active.cjs /app/verify-rustress-payout-active.cjs
COPY migrate-london-payout-v5-to-v6.cjs /app/migrate-london-payout-v5-to-v6.cjs
LABEL org.bitcoinwalk.version="0.2.18" org.bitcoinwalk.mode="operation"
