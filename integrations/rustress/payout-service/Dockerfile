FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
LABEL org.bitcoinwalk.service="rustress-payout" org.bitcoinwalk.mode="disabled"
WORKDIR /app
COPY rustress-payout-service.cjs verify-rustress-payout-service.cjs verify-rustress-payout-active.cjs initialize-rustress-payout-ledger.cjs backup-sqlite-online.mjs ./
USER 0:0
EXPOSE 8893
ENTRYPOINT ["node","/app/rustress-payout-service.cjs"]
