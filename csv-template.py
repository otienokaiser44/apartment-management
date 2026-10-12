import pandas as pd

# Creating a test CSV template for bulk tenant onboarding / linking
tenant_data = [
    {
        "unit_number": "101",
        "floor": 1,
        "tenant_name": "Amina Mohamed",
        "tenant_email": "amina.mohamed@example.com",
        "tenant_phone": "+254712345678",
        "lease_start_date": "2026-01-01",
        "lease_end_date": "2026-12-31"
    },
    {
        "unit_number": "102",
        "floor": 1,
        "tenant_name": "Brian Kiprop",
        "tenant_email": "brian.kiprop@example.com",
        "tenant_phone": "+254722345678",
        "lease_start_date": "2026-02-01",
        "lease_end_date": "2027-01-31"
    },
    {
        "unit_number": "103",
        "floor": 1,
        "tenant_name": "Cynthia Akinyi",
        "tenant_email": "cynthia.akinyi@example.com",
        "tenant_phone": "+254733345678",
        "lease_start_date": "2026-03-01",
        "lease_end_date": "2027-02-28"
    },
    {
        "unit_number": "201",
        "floor": 2,
        "tenant_name": "Daniel Kamau",
        "tenant_email": "daniel.kamau@example.com",
        "tenant_phone": "+254744345678",
        "lease_start_date": "2026-04-01",
        "lease_end_date": "2027-03-31"
    },
    {
        "unit_number": "202",
        "floor": 2,
        "tenant_name": "Esther Wanjiku",
        "tenant_email": "esther.wanjiku@example.com",
        "tenant_phone": "+254755345678",
        "lease_start_date": "2026-05-01",
        "lease_end_date": "2027-04-30"
    },
    {
        "unit_number": "203",
        "floor": 2,
        "tenant_name": "Felix Ochieng",
        "tenant_email": "felix.ochieng@example.com",
        "tenant_phone": "+254766345678",
        "lease_start_date": "2026-06-01",
        "lease_end_date": "2027-05-31"
    },
    {
        "unit_number": "301",
        "floor": 3,
        "tenant_name": "Grace Mutheu",
        "tenant_email": "grace.mutheu@example.com",
        "tenant_phone": "+254777345678",
        "lease_start_date": "2026-07-01",
        "lease_end_date": "2027-06-30"
    },
    {
        "unit_number": "302",
        "floor": 3,
        "tenant_name": "Hassan Juma",
        "tenant_email": "hassan.juma@example.com",
        "tenant_phone": "+254788345678",
        "lease_start_date": "2026-08-01",
        "lease_end_date": "2027-07-31"
    },
    {
        "unit_number": "401",
        "floor": 4,
        "tenant_name": "Ivy Chepkoech",
        "tenant_email": "ivy.chepkoech@example.com",
        "tenant_phone": "+254799345678",
        "lease_start_date": "2026-09-01",
        "lease_end_date": "2027-08-31"
    },
    {
        "unit_number": "501",
        "floor": 5,
        "tenant_name": "John Njoroge",
        "tenant_email": "john.njoroge@example.com",
        "tenant_phone": "+254700345678",
        "lease_start_date": "2026-10-01",
        "lease_end_date": "2027-09-30"
    }
]

df_tenant = pd.DataFrame(tenant_data)
tenant_csv_filename = "tenants-bulk-test-data.csv"
df_tenant.to_csv(tenant_csv_filename, index=False)
print(f"Generated {tenant_csv_filename}")