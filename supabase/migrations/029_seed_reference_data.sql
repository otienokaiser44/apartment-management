-- 029: reference data required by every environment (not demo data).

insert into public.amenities (name, slug, description) values
  ('Parking',            'parking',            'Dedicated parking space'),
  ('24h Security',       'security',           'Guards and/or CCTV around the clock'),
  ('Backup Generator',   'generator',          'Backup power during outages'),
  ('Water Tank',         'water-tank',         'Reserve water storage'),
  ('Borehole',           'borehole',           'On-site borehole water'),
  ('Lift / Elevator',    'elevator',           'Passenger lift'),
  ('Swimming Pool',      'swimming-pool',      'Shared swimming pool'),
  ('Gym',                'gym',                'On-site fitness facilities'),
  ('High-speed Internet','internet',           'Fibre or equivalent available'),
  ('Balcony',            'balcony',            'Private balcony'),
  ('Garden',             'garden',             'Shared or private garden'),
  ('Pet Friendly',       'pet-friendly',       'Pets allowed by arrangement'),
  ('Furnished',          'furnished',          'Comes furnished'),
  ('Laundry',            'laundry',            'Laundry area or facilities'),
  ('Gated Compound',     'gated-compound',     'Controlled-access compound')
on conflict (slug) do nothing;

insert into public.verification_document_types (code, label, description, is_required) values
  ('ownership_proof',    'Proof of ownership',        'Title deed, lease headlease or sale agreement', true),
  ('owner_id',           'Owner identification',      'National ID or passport of the owner/manager',  false),
  ('utility_bill',       'Recent utility bill',       'Water/electricity bill showing the property address', false),
  ('permit',             'Occupancy / business permit','County permit or occupation certificate',      false),
  ('property_photo',     'Property photo evidence',   'Dated photos of the building',                  false)
on conflict (code) do nothing;
