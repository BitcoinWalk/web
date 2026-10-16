FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
LABEL org.bitcoinwalk.service="sponsor-payout" org.bitcoinwalk.mode="disabled"
WORKDIR /app
COPY sponsor-payout-service.cjs verify-sponsor-payout-service.cjs verify-sponsor-payout-restore.cjs backup-sqlite-online.mjs ./
USER 0:0
EXPOSE 8896
ENTRYPOINT ["node","/app/sponsor-payout-service.cjs"]
