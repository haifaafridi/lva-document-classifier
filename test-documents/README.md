# Weeks 8-10 synthetic demo test set

These files contain **synthetic data only** and no real persons/cases. The positive examples intentionally avoid printing the official target LVA series title/number in the body, except test 11 which deliberately contains a false prompt-like instruction as a robustness trap.

Coverage:

1. `01_supplier_invoice_payment_packet.pdf` - born-digital PDF / Accounts Payable.
2. `02_public_records_request_response.docx` - Word / FOIA request.
3. `03_roll_call_roster.xlsx` - Excel / Roll Call Files.
4. `04_traffic_crash_report_ocr.png` - image OCR / citizen traffic crash report.
5. `05_citizen_complaint_scanned.pdf` - image-only scanned PDF OCR / Citizen Complaint Files.
6. `06_long_recruitment_hiring_packet.pdf` - long multi-page document for chunking/overlap.
7. `07_school_bus_route_assignment.docx` - Word / School Bus Route Files.
8. `08_payroll_register.xlsx` - Excel / Payroll Records.
9. `09_no_match_personal_recipe.png` - negative OCR case; expected `NO_MATCH`.
10. `10_towed_vehicle_custody_file.pdf` - born-digital PDF / Towed Vehicle Files.
11. `11_prompt_injection_invoice.pdf` - prompt-injection robustness; actual purpose is Accounts Payable even though record content contains a false instruction to output another series.

Expected answers are in `ground_truth.json`.

Run:

```powershell
npm run evaluate:retrieval
npm run evaluate:end-to-end
```

Remember: retrieval Top-3 and final classification are different measurements.
