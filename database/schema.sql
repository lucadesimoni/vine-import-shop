-- Portable schema (SQLite + MySQL/MariaDB). Tokens are replaced by the installer:
--   {{PK}}     → primary key definition per driver
--   {{ENGINE}} → table options (MySQL only)
-- Money is stored as integer Rappen/cents. Translatable fields are JSON text.

CREATE TABLE customer_groups (
  id {{PK}},
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  is_b2b INT NOT NULL DEFAULT 0,
  price_display VARCHAR(10) NOT NULL DEFAULT 'gross',
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  min_order_net INT NOT NULL DEFAULT 0,
  erp_code VARCHAR(50) NULL
){{ENGINE}};

CREATE TABLE users (
  id {{PK}},
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(191) NOT NULL DEFAULT '',
  company VARCHAR(191) NULL,
  uid_number VARCHAR(50) NULL,
  phone VARCHAR(50) NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer',
  customer_group_id INT NULL,
  b2b_status VARCHAR(20) NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'de',
  billing_json TEXT NULL,
  shipping_json TEXT NULL,
  newsletter INT NOT NULL DEFAULT 0,
  birthdate VARCHAR(10) NULL,
  erp_id VARCHAR(64) NULL,
  reset_token VARCHAR(100) NULL,
  reset_expires VARCHAR(20) NULL,
  created_at VARCHAR(20) NOT NULL,
  updated_at VARCHAR(20) NULL
){{ENGINE}};

CREATE TABLE categories (
  id {{PK}},
  slug VARCHAR(191) NOT NULL UNIQUE,
  parent_id INT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'wine',
  name_json TEXT NOT NULL,
  description_json TEXT NULL,
  sort INT NOT NULL DEFAULT 0
){{ENGINE}};

CREATE TABLE producers (
  id {{PK}},
  slug VARCHAR(191) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  country VARCHAR(80) NULL,
  region VARCHAR(120) NULL,
  founded VARCHAR(10) NULL,
  hectares VARCHAR(20) NULL,
  description_json TEXT NULL,
  erp_id VARCHAR(64) NULL
){{ENGINE}};

CREATE TABLE products (
  id {{PK}},
  sku VARCHAR(64) NOT NULL UNIQUE,
  erp_id VARCHAR(64) NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL DEFAULT 'wine',
  category_id INT NULL,
  producer_id INT NULL,
  name_json TEXT NOT NULL,
  short_json TEXT NULL,
  description_json TEXT NULL,
  color VARCHAR(20) NULL,
  country VARCHAR(80) NULL,
  region VARCHAR(120) NULL,
  appellation VARCHAR(191) NULL,
  grapes VARCHAR(255) NULL,
  vintage VARCHAR(10) NULL,
  volume_ml INT NULL,
  alcohol DECIMAL(4,1) NULL,
  organic INT NOT NULL DEFAULT 0,
  tasting_json TEXT NULL,
  pairing_json TEXT NULL,
  serving_temp VARCHAR(20) NULL,
  aging VARCHAR(40) NULL,
  rating VARCHAR(40) NULL,
  price_gross INT NOT NULL DEFAULT 0,
  tax_class VARCHAR(20) NOT NULL DEFAULT 'standard',
  case_size INT NOT NULL DEFAULT 6,
  stock INT NOT NULL DEFAULT 0,
  min_qty INT NOT NULL DEFAULT 1,
  b2b_only INT NOT NULL DEFAULT 0,
  age_restricted INT NOT NULL DEFAULT 1,
  active INT NOT NULL DEFAULT 1,
  featured INT NOT NULL DEFAULT 0,
  image VARCHAR(255) NULL,
  synced_at VARCHAR(20) NULL,
  created_at VARCHAR(20) NOT NULL,
  updated_at VARCHAR(20) NULL
){{ENGINE}};

CREATE INDEX idx_products_cat ON products (category_id);
CREATE INDEX idx_products_producer ON products (producer_id);
CREATE INDEX idx_products_active ON products (active, type);

-- Group / tier prices (net, excl. VAT). min_qty enables quantity breaks.
CREATE TABLE prices (
  id {{PK}},
  product_id INT NOT NULL,
  customer_group_id INT NOT NULL,
  min_qty INT NOT NULL DEFAULT 1,
  price_net INT NOT NULL
){{ENGINE}};
CREATE INDEX idx_prices_lookup ON prices (product_id, customer_group_id);

CREATE TABLE orders (
  id {{PK}},
  number VARCHAR(40) NOT NULL UNIQUE,
  access_token VARCHAR(64) NOT NULL,
  user_id INT NULL,
  customer_group_id INT NULL,
  is_b2b INT NOT NULL DEFAULT 0,
  email VARCHAR(191) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  payment_method VARCHAR(30) NOT NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_ref VARCHAR(191) NULL,
  shipping_method VARCHAR(30) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'CHF',
  subtotal_net INT NOT NULL DEFAULT 0,
  subtotal_gross INT NOT NULL DEFAULT 0,
  shipping_gross INT NOT NULL DEFAULT 0,
  discount_gross INT NOT NULL DEFAULT 0,
  tax_total INT NOT NULL DEFAULT 0,
  total_gross INT NOT NULL DEFAULT 0,
  coupon_code VARCHAR(50) NULL,
  billing_json TEXT NOT NULL,
  shipping_json TEXT NULL,
  notes TEXT NULL,
  po_number VARCHAR(80) NULL,
  delivery_date VARCHAR(20) NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'de',
  erp_id VARCHAR(64) NULL,
  erp_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at VARCHAR(20) NOT NULL,
  updated_at VARCHAR(20) NULL
){{ENGINE}};
CREATE INDEX idx_orders_user ON orders (user_id);

CREATE TABLE order_items (
  id {{PK}},
  order_id INT NOT NULL,
  product_id INT NULL,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  qty INT NOT NULL,
  unit_net INT NOT NULL,
  unit_gross INT NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL,
  line_gross INT NOT NULL
){{ENGINE}};
CREATE INDEX idx_items_order ON order_items (order_id);

CREATE TABLE wishlist (
  id {{PK}},
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at VARCHAR(20) NOT NULL
){{ENGINE}};
CREATE INDEX idx_wishlist_user ON wishlist (user_id);

CREATE TABLE coupons (
  id {{PK}},
  code VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL DEFAULT 'percent',
  value INT NOT NULL,
  min_total INT NOT NULL DEFAULT 0,
  b2c_only INT NOT NULL DEFAULT 1,
  active INT NOT NULL DEFAULT 1,
  expires_at VARCHAR(20) NULL
){{ENGINE}};

CREATE TABLE newsletter (
  id {{PK}},
  email VARCHAR(191) NOT NULL UNIQUE,
  locale VARCHAR(5) NOT NULL DEFAULT 'de',
  created_at VARCHAR(20) NOT NULL
){{ENGINE}};

-- Reliable ERP hand-off: every outbound message is queued and retried.
CREATE TABLE erp_outbox (
  id {{PK}},
  type VARCHAR(30) NOT NULL,
  ref_id INT NOT NULL,
  payload TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  next_attempt_at VARCHAR(20) NULL,
  created_at VARCHAR(20) NOT NULL,
  sent_at VARCHAR(20) NULL
){{ENGINE}};
CREATE INDEX idx_outbox_status ON erp_outbox (status);

CREATE TABLE sync_log (
  id {{PK}},
  job VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  items INT NOT NULL DEFAULT 0,
  message TEXT NULL,
  started_at VARCHAR(20) NOT NULL,
  finished_at VARCHAR(20) NULL
){{ENGINE}};

CREATE TABLE settings (
  name VARCHAR(100) NOT NULL PRIMARY KEY,
  value TEXT NULL
){{ENGINE}};
