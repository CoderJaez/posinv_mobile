export const DATABASE_VERSION = 6;

export const seedPinHashes = {
  '1234': 'sha256:7c945c5f416ccab502046c840c08f67d5aa1dac293641dd4574d84cc01998146',
  '2468': 'sha256:f920587bac8731a489311448aaab10f801e2c93e6c5d6dadaf374c394c6d6fe1',
  '1357': 'sha256:49b26f99fb50a3bd626d5cff086d17aee30d5b54ca98570526c78ac96c304cf1',
  '0000': 'sha256:ef9343a24dd8b292c00b42750f3fd04f52639867b36586ede9831b048338f410',
} as const;

export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('cashier', 'supervisor', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  avatar_color TEXT NOT NULL DEFAULT '#009B55',
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_balance REAL NOT NULL DEFAULT 0,
  expected_cash REAL NOT NULL DEFAULT 0,
  actual_cash REAL,
  cash_in_total REAL NOT NULL DEFAULT 0,
  cash_out_total REAL NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cash_drawer_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('cash_in', 'cash_out')),
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  category_id INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pc',
  regular_price REAL NOT NULL,
  promo_price REAL,
  unit_cost REAL NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  image_color TEXT NOT NULL DEFAULT '#E6F7EE',
  image_uri TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE (product_id, batch_number)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  shift_id INTEGER,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('stock_in', 'sale', 'adjustment', 'return', 'cash_in', 'cash_out', 'void')),
  quantity INTEGER NOT NULL DEFAULT 0,
  previous_stock INTEGER,
  new_stock INTEGER,
  reason TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  address TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_visit_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE (supplier_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS delivery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  batch_number TEXT,
  expiry_date TEXT,
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  shift_id INTEGER,
  cashier_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
  subtotal REAL NOT NULL,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  net_sales REAL NOT NULL,
  void_reason TEXT,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (cashier_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  original_unit_price REAL,
  price_override_reason TEXT,
  discount_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'gcash', 'maya', 'grabpay')),
  amount REAL NOT NULL,
  cash_received REAL,
  change_due REAL,
  reference_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  sale_item_id INTEGER,
  product_id INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('quantity_update', 'remove_item')),
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  quantity_delta INTEGER NOT NULL,
  previous_unit_price REAL NOT NULL,
  new_unit_price REAL NOT NULL,
  amount_delta REAL NOT NULL,
  restock INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER,
  receipt_number TEXT,
  printer_name TEXT,
  printer_address TEXT,
  connection_type TEXT NOT NULL DEFAULT 'bluetooth',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  payload_text TEXT NOT NULL,
  error_message TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_at TEXT,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS held_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hold_number TEXT NOT NULL UNIQUE,
  cashier_id INTEGER NOT NULL,
  shift_id INTEGER,
  cart_json TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'resumed', 'voided')),
  held_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resumed_at TEXT,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  promo_type TEXT NOT NULL CHECK (promo_type IN ('bundle', 'time_discount', 'percentage_discount', 'fixed_discount')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'scheduled', 'inactive')),
  product_id INTEGER,
  category_id INTEGER,
  discount_value REAL NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  rule_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS prepaid_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier_id INTEGER NOT NULL,
  shift_id INTEGER,
  provider TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  amount REAL NOT NULL,
  service_fee REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'voided')),
  reference_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_movements_shift ON cash_drawer_movements(shift_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_sales_completed_at ON sales(completed_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_adjustments_sale ON sale_adjustments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_adjustments_created_at ON sale_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_sale ON print_jobs(sale_id);
CREATE INDEX IF NOT EXISTS idx_held_transactions_status ON held_transactions(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
`;

export const phase2MigrationSql = `
CREATE TABLE IF NOT EXISTS cash_drawer_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('cash_in', 'cash_out')),
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_movements_shift ON cash_drawer_movements(shift_id);

UPDATE users SET pin_hash = '${seedPinHashes['1234']}' WHERE pin_hash = '1234';
UPDATE users SET pin_hash = '${seedPinHashes['2468']}' WHERE pin_hash = '2468';
UPDATE users SET pin_hash = '${seedPinHashes['1357']}' WHERE pin_hash = '1357';
UPDATE users SET pin_hash = '${seedPinHashes['0000']}' WHERE pin_hash = '0000';
`;

export const phase6MigrationSql = `
INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('branch_name', 'Main Branch');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('branch_code', 'MAIN');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('receipt_header', 'StoreMate Convenience Store');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('payment_methods', '{"cash":true,"card":true,"gcash":true,"maya":true,"grabpay":true}');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('hardware_printer', 'Not configured');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('hardware_scanner', 'Keyboard wedge scanner');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('backup_sync_status', 'Offline-only mode');

INSERT INTO promotions
  (name, promo_type, status, product_id, category_id, discount_value, starts_at, ends_at, rule_json)
SELECT
  'Buy 1 Take 1 (Coke 500ml)',
  'bundle',
  'active',
  products.id,
  NULL,
  0,
  '2026-05-01 00:00:00',
  '2026-05-31 23:59:59',
  '{"buyQty":1,"freeQty":1}'
FROM products
WHERE products.sku = 'CKE500'
  AND NOT EXISTS (SELECT 1 FROM promotions WHERE name = 'Buy 1 Take 1 (Coke 500ml)');

INSERT INTO promotions
  (name, promo_type, status, product_id, category_id, discount_value, starts_at, ends_at, rule_json)
SELECT
  'Happy Hour 10% Off',
  'time_discount',
  'active',
  NULL,
  categories.id,
  10,
  '2026-05-01 16:00:00',
  '2026-05-31 19:00:00',
  '{"startTime":"16:00","endTime":"19:00"}'
FROM categories
WHERE categories.name = 'Beverages'
  AND NOT EXISTS (SELECT 1 FROM promotions WHERE name = 'Happy Hour 10% Off');

INSERT INTO promotions
  (name, promo_type, status, product_id, category_id, discount_value, starts_at, ends_at, rule_json)
SELECT
  '10% Off Snacks',
  'percentage_discount',
  'scheduled',
  NULL,
  categories.id,
  10,
  '2026-05-01 00:00:00',
  '2026-05-15 23:59:59',
  '{}'
FROM categories
WHERE categories.name = 'Snacks'
  AND NOT EXISTS (SELECT 1 FROM promotions WHERE name = '10% Off Snacks');

INSERT INTO promotions
  (name, promo_type, status, product_id, category_id, discount_value, starts_at, ends_at, rule_json)
SELECT
  'P20 Off P200',
  'fixed_discount',
  'inactive',
  NULL,
  NULL,
  20,
  '2026-05-10 00:00:00',
  '2026-05-20 23:59:59',
  '{"minimumSpend":200}'
WHERE NOT EXISTS (SELECT 1 FROM promotions WHERE name = 'P20 Off P200');

CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_prepaid_created_at ON prepaid_transactions(created_at);
`;

export const productImageMigrationSql = `
ALTER TABLE products ADD COLUMN image_uri TEXT;
`;

export const salesAdjustmentsAndPrintMigrationSql = `
ALTER TABLE sale_items ADD COLUMN original_unit_price REAL;
ALTER TABLE sale_items ADD COLUMN price_override_reason TEXT;

UPDATE sale_items
SET original_unit_price = unit_price
WHERE original_unit_price IS NULL;

CREATE TABLE IF NOT EXISTS sale_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  sale_item_id INTEGER,
  product_id INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('quantity_update', 'remove_item')),
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  quantity_delta INTEGER NOT NULL,
  previous_unit_price REAL NOT NULL,
  new_unit_price REAL NOT NULL,
  amount_delta REAL NOT NULL,
  restock INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER,
  receipt_number TEXT,
  printer_name TEXT,
  printer_address TEXT,
  connection_type TEXT NOT NULL DEFAULT 'bluetooth',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  payload_text TEXT NOT NULL,
  error_message TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_at TEXT,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('printer_connection_type', 'bluetooth');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('printer_name', '');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('printer_address', '');

INSERT OR IGNORE INTO app_settings (key, value)
VALUES ('printer_paper_width', '58mm');

CREATE INDEX IF NOT EXISTS idx_sale_adjustments_sale ON sale_adjustments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_adjustments_created_at ON sale_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_sale ON print_jobs(sale_id);
`;

export const customerModuleMigrationSql = `
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  address TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_visit_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO customers
  (full_name, phone, email, address, loyalty_points, notes, status, last_visit_at)
VALUES
  ('Rosa Mendoza', '0917-555-1201', 'rosa.mendoza@example.local', 'Mandaluyong City', 120, 'Prefers SMS updates for promos.', 'active', '2026-05-06 11:20:00');

INSERT OR IGNORE INTO customers
  (full_name, phone, email, address, loyalty_points, notes, status, last_visit_at)
VALUES
  ('Carlo Reyes', '0917-555-1202', 'carlo.reyes@example.local', 'Quezon City', 45, 'Buys prepaid load weekly.', 'active', '2026-05-05 16:05:00');

INSERT OR IGNORE INTO customers
  (full_name, phone, email, address, loyalty_points, notes, status, last_visit_at)
VALUES
  ('Mina Santos', '0917-555-1203', NULL, 'Pasig City', 0, 'Walk-in customer record for warranty references.', 'active', NULL);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
`;
