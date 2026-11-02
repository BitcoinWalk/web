FROM bitcoinwalk-rustress-payout:0.2.18
COPY rustress-payout-service-0.2.19.cjs /app/rustress-payout-service.cjs
COPY verify-rustress-payout-active.cjs /app/verify-rustress-payout-active.cjs
LABEL org.bitcoinwalk.version="0.2.19" org.bitcoinwalk.mode="operation"
