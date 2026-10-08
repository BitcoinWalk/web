#!/usr/bin/env python3
"""Read-only setup inventory: no private keys, invoices or payout addresses."""
import json
import sqlite3

db = sqlite3.connect("file:/var/lib/bitcoinwalk-app-staging/payments.sqlite?mode=ro", uri=True)
tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
result = {}
if "paid_city_entitlement" in tables:
    result["paidCityIds"] = [row[0] for row in db.execute("SELECT cityId FROM paid_city_entitlement")]
if "pro_setup_task" in tables:
    result["setup"] = [dict(cityId=row[0], state=row[1], payoutConfirmed=row[2] is not None, signerConfirmed=row[3] is not None) for row in db.execute("SELECT cityId,state,payoutVersion,brandPubkey FROM pro_setup_task")]
if "city_brand_request" in tables:
    result["cityIdentities"] = [dict(cityId=row[0], state=row[1]) for row in db.execute("SELECT city_id,status FROM city_brand_request")]
print(json.dumps(result))
db.close()
