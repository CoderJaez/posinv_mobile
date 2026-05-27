# StoreMate POS & Inventory Mobile

Tablet-first offline convenience store POS and inventory app built with Expo React Native, TypeScript, Expo Router, SQLite, Zustand, and React Hook Form.

This version has no backend, no cloud sync, no Firebase, no Supabase, and no external database. All operational data is stored locally in `expo-sqlite`; AsyncStorage is used only for lightweight session IDs.

## Current Status

### Phase 1: Project Setup & Database

Implemented:

- Expo React Native TypeScript setup
- Expo Router stack navigation
- Tablet-first landscape app shell with dark sidebar
- SQLite initialization through `SQLiteProvider`
- Database schema and seed data
- Sample products from the prototype
- Reusable UI components:
  - `Button`
  - `Card`
  - `Sidebar`
  - `Header`
  - `Badge`
  - `Input`
  - `Table`
  - `Modal`

### Phase 2: Authentication, Users & Shifts

Implemented:

- Local PIN login with avatar/user selection
- PIN hashing using `expo-crypto`
- Session rehydration from SQLite plus AsyncStorage session IDs
- Role-aware screen guards
- Cashier, Supervisor, and Admin roles
- Start shift flow
- End shift flow
- Shift summary screen
- Opening balance
- Expected cash
- Actual cash
- Cash variance
- Cash in/out tracking
- Audit log writes for login, failed login, shift start, shift end, and cash drawer movements
- Admin-only User Management screen with user and recent shift tables

### Phase 3: POS Checkout

Implemented:

- Live cart state using Zustand
- Product grid backed by SQLite products
- Category filtering
- Product search by name, SKU, or barcode
- Add item to cart
- Manual item price override with adjustment reason for weighed or variable-price items
- Quantity increment/decrement
- Remove item
- Void current cart
- Hold current transaction to SQLite
- Resume held transactions
- Clear held transactions
- Payment method screen
- Cash payment screen with change calculation
- Payment success screen
- Payment methods:
  - Cash
  - Card
  - GCash
  - Maya
  - GrabPay
- Completed sales saved locally into `sales`, `sale_items`, and `payments`
- Original unit price and override reason stored per sale line
- Active product, category, bundle, time-based, and basket fixed promotions applied to POS totals
- Product stock deducted automatically on completed sale
- Inventory batches deducted using earliest-expiry-first logic when batch rows exist
- Stock movements written for each sold item
- Active shift expected cash updated for cash payments
- Sale completion audit log entries

### Phase 4: Inventory & Stock-In

Implemented:

- Inventory list search and stock status filters
- Product details screen
- Batch and expiry table per product
- Stock movement history per product
- Add product screen
- Edit product screen
- Admin product deletion from Settings when current stock and batch stock are both zero
- Product fields:
  - SKU
  - Barcode
  - Category
  - Unit
  - Regular price
  - Promo price
  - Unit cost
  - Opening stock
  - Reorder level
- Local product image upload from the tablet photo library
- Product images copied into app document storage and referenced by SQLite
- Product image display on Product Details, POS product grid, and cart rows
- Stock adjustment screen
- Positive and negative adjustments
- Batch creation/update for positive adjustments
- Earliest-expiry-first batch deduction for negative adjustments
- Stock movement and audit log entries for adjustments
- Supplier list screen
- Add supplier form
- Supplier search
- Edit supplier details
- Soft-delete suppliers from active lists while preserving delivery history
- Recent delivery list
- Stock-in delivery screen
- Supplier selection
- Invoice number
- Delivery date
- Multiple delivery item rows
- Batch number
- Expiry date
- Quantity
- Unit cost
- Delivery total
- Save delivery
- Automatic stock increase
- Automatic `inventory_batches`, `delivery_items`, `stock_movements`, and `audit_logs` writes

### Phase 5: Reports & Analytics

Implemented:

- Reports dashboard backed by local SQLite sales data
- Daily, weekly, and monthly report ranges
- Total sales KPI
- Total transactions KPI
- Average basket KPI
- Items sold KPI
- Hourly sales chart
- Top-selling products
- Payment method breakdown
- Sales quality metrics:
  - Discounts
  - Returns
  - Cancelled transactions
  - Net sales
- Sales report details screen
- Completed sale row details with cashier, item count, adjustment count, payment methods, discounts, and net sales
- Returned/adjusted sale items reflected in returns and net sales metrics
- Empty states for report ranges with no sales
- Export report placeholder

### Phase 6: Promotions, Prepaid & Settings

Implemented:

- Promotion list backed by local SQLite data
- Create promotion flow
- Edit promotion flow
- Admin delete promotion workflow
- Active promotions automatically applied in checkout:
  - Product and category percentage discounts
  - Time-based discounts using optional `startTime` and `endTime` rule JSON
  - Bundle rules using `buyQty` and `freeQty` rule JSON
  - Basket fixed discounts using optional `minimumSpend` rule JSON
- Promo types:
  - Bundle
  - Time-based discount
  - Percentage discount
  - Fixed discount
- Promo statuses:
  - Active
  - Scheduled
  - Inactive
- Product, category, and basket-level promotion targets
- Rule JSON validation for advanced promo metadata
- Seeded prototype-style promo examples through database migration v3
- Prepaid/load transaction flow
- Smart, Globe, TNT, and Sun provider selection
- Preset and custom load amounts
- Service fee and reference number capture
- Shift and cashier attribution for prepaid records
- Cash drawer expected cash update for prepaid/load cash collected
- Recent prepaid transaction table
- Settings dashboard with local editable settings
- General settings
- Payment method toggles
- Receipt settings
- Admin category management with add, edit, search, and delete controls
- Admin product management with search and zero-stock delete controls
- Printing module management
- Local printer profile for Bluetooth or system print mode
- Receipt print jobs logged locally through `print_jobs`
- Receipt printing through Expo's local print pipeline for paired/available receipt printers
- Users & roles shortcut
- Local SQLite database export
- Local SQLite database import with safety backup before restore
- Offline backup status panel
- Branch settings
- System logs from `audit_logs`
- About system panel with local database counts
- Admin-only user create/edit/deactivate/reset-PIN workflow
- Last active admin protection

### Phase 7: Polish, Testing & Finalization

Implemented:

- Shared loading, empty, and error state component
- Inventory loading and database error states
- Reports loading and database error states
- Cash payment validation extracted into reusable domain logic
- Sale total calculation extracted into reusable domain logic
- Batch stock deduction planning extracted into reusable domain logic
- Report summary calculation extracted into reusable domain logic
- SQLite integrity and foreign key health check from Settings > About System
- Basic unit tests for:
  - Sale totals and cash change
  - Underpaid cash rejection
  - Earliest-expiry-first stock deduction
  - Negative stock prevention
  - Report summary calculations
- Test runner added through Node test plus `tsx`

## Seeded Login Users

| User | Role | PIN |
| --- | --- | --- |
| Juan Dela Cruz | Cashier | `1234` |
| Maria Santos | Cashier | `2468` |
| Ana Reyes | Supervisor | `1357` |
| Admin User | Admin | `0000` |

Role access:

- Cashier: POS, shift flow, prepaid/load recording, inventory visibility
- Supervisor: cashier access plus reports, suppliers, stock-in, and promotions
- Admin: all screens including settings

## Run Locally

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npx expo start
```

For offline CLI startup:

```bash
npx expo start --offline --port 8081
```

Run checks:

```bash
npx tsc --noEmit
npm run lint
npm test
```

## Main Routes

- `/login` - user avatar selection and PIN login
- `/shift-start` - opening drawer balance and shift start
- `/` - POS checkout with live cart, hold, void, and pay actions
- `/payment` - payment method selection
- `/cash-payment` - cash received and change calculation
- `/payment-success` - completed sale confirmation
- `/sale-adjustment` - supervisor/admin sold transaction item adjustment and return logging
- `/hold-transactions` - held cart resume and clear flow
- `/shift-summary` - active or closed shift cash drawer summary
- `/inventory` - product list backed by SQLite seed data
- `/product-details` - product price, stock, batch, expiry, and movement details
- `/product-form` - add or edit product master data
- `/adjust-stock` - manual stock adjustment
- `/users` - admin-only user management and recent shift records
- `/reports` - local sales reports dashboard with KPIs, chart, top items, and payment breakdown
- `/sales-report-details` - detailed sales report with daily, weekly, and monthly filters
- `/stock-in` - supplier delivery recording with automatic stock increase
- `/suppliers` - supplier list with add, edit, search, delete, and recent delivery references
- `/promotions` - local promotion list, create, and edit workflow
- `/prepaid` - prepaid/load transaction recording
- `/settings` - editable local settings, category/product management, database backup, hardware placeholders, system logs, and about panel

## Local Database

Database name: `storemate_pos.db`

Created tables:

- `users`
- `shifts`
- `cash_drawer_movements`
- `products`
- `categories`
- `inventory_batches`
- `stock_movements`
- `suppliers`
- `deliveries`
- `delivery_items`
- `sales`
- `sale_items`
- `sale_adjustments`
- `payments`
- `print_jobs`
- `held_transactions`
- `promotions`
- `prepaid_transactions`
- `audit_logs`
- `app_settings`

Database migrations are versioned through `PRAGMA user_version`.

## Project Structure

```text
app/
  _layout.tsx
  login.tsx
  shift-start.tsx
  shift-summary.tsx
  index.tsx
  payment.tsx
  cash-payment.tsx
  payment-success.tsx
  hold-transactions.tsx
  inventory.tsx
  product-details.tsx
  product-form.tsx
  adjust-stock.tsx
  reports.tsx
  sales-report-details.tsx
  stock-in.tsx
  suppliers.tsx
  promotions.tsx
  prepaid.tsx
  settings.tsx
  users.tsx
components/
  auth/
  layout/
  ui/
constants/
  theme.ts
lib/
  auth/
  database/
  domain/
  printing/
  store/
tests/
  domain.test.ts
```

## Notes

- This app is intentionally offline-only for the current version.
- Reports are calculated from completed local sales in SQLite; empty ranges show zero-value KPIs and empty states.
- Promotion rules are managed locally and active rules are applied to POS totals before payment.
- Sold transaction adjustments are logged locally and can return removed quantity to stock or remove it without restocking.
- Receipt printing uses `expo-print`, so direct Bluetooth ESC/POS discovery/write support still requires a native adapter and development build. The app stores Bluetooth printer profile details and logs every print attempt locally.
- POS discount automation is still minimal and will be expanded in later phases.
- Prepaid/load records are local-only and do not call provider APIs.
- The integrity check verifies SQLite `PRAGMA integrity_check` and `PRAGMA foreign_key_check` locally.
- Category deletion is blocked while products are assigned to the category.
- Product deletion is a soft delete and is blocked until current stock and batch stock are zero.
- App updates retain the local SQLite database when installed over the existing app with the same package/application ID. Uninstalling the app still removes local app data at the OS level.
