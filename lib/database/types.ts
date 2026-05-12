export type UserRole = 'cashier' | 'supervisor' | 'admin';

export type StockStatus = 'inStock' | 'lowStock' | 'critical' | 'expiringSoon';

export type Category = {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
};

export type ProductListItem = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  category_name: string;
  unit: string;
  regular_price: number;
  promo_price: number | null;
  current_stock: number;
  reorder_level: number;
  nearest_expiry: string | null;
  image_color: string;
};

export type ProductDetails = ProductListItem & {
  category_id: number;
  unit_cost: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type InventoryBatch = {
  id: number;
  product_id: number;
  product_name?: string;
  batch_number: string;
  expiry_date: string | null;
  quantity: number;
  unit_cost: number;
  created_at: string;
};

export type StockMovement = {
  id: number;
  product_id: number;
  product_name?: string;
  batch_id: number | null;
  shift_id: number | null;
  movement_type: 'stock_in' | 'sale' | 'adjustment' | 'return' | 'cash_in' | 'cash_out' | 'void';
  quantity: number;
  previous_stock: number | null;
  new_stock: number | null;
  reason: string | null;
  reference_type: string | null;
  reference_id: number | null;
  created_by: number | null;
  created_at: string;
};

export type Supplier = {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: number;
  created_at: string;
};

export type DeliveryListItem = {
  id: number;
  supplier_id: number;
  supplier_name: string;
  invoice_number: string;
  delivery_date: string;
  total_amount: number;
  created_by: number | null;
  created_at: string;
};

export type UserListItem = {
  id: number;
  full_name: string;
  username: string;
  role: UserRole;
  status: 'active' | 'inactive';
  last_login_at: string | null;
  avatar_color: string;
};

export type AuthUser = UserListItem & {
  pin_hash: string;
};

export type ShiftStatus = 'open' | 'closed';

export type Shift = {
  id: number;
  user_id: number;
  user_name?: string;
  status: ShiftStatus;
  opening_balance: number;
  expected_cash: number;
  actual_cash: number | null;
  cash_in_total: number;
  cash_out_total: number;
  cash_sales_total?: number;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
};

export type CashDrawerMovementType = 'cash_in' | 'cash_out';

export type CashDrawerMovement = {
  id: number;
  shift_id: number;
  user_id: number;
  movement_type: CashDrawerMovementType;
  amount: number;
  reason: string;
  created_at: string;
};

export type ShiftSummary = Shift & {
  cashier_name: string;
  cashier_role: UserRole;
  cash_movements: CashDrawerMovement[];
};

export type PaymentMethod = 'cash' | 'card' | 'gcash' | 'maya' | 'grabpay';

export type CartItemSnapshot = {
  productId: number;
  name: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  imageColor: string;
  currentStock: number;
};

export type HeldTransaction = {
  id: number;
  hold_number: string;
  cashier_id: number;
  cashier_name?: string;
  shift_id: number | null;
  cart_json: string;
  subtotal: number;
  discount_total: number;
  total: number;
  status: 'held' | 'resumed' | 'voided';
  held_at: string;
  resumed_at: string | null;
};

export type SaleRecord = {
  id: number;
  receipt_number: string;
  shift_id: number | null;
  cashier_id: number;
  cashier_name?: string;
  status: 'completed' | 'voided' | 'refunded';
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  net_sales: number;
  completed_at: string;
};

export type ReportRange = 'daily' | 'weekly' | 'monthly';

export type ReportSummary = {
  total_sales: number;
  total_transactions: number;
  average_basket: number;
  items_sold: number;
  discounts: number;
  returns: number;
  cancelled_transactions: number;
  net_sales: number;
};

export type HourlySalesPoint = {
  hour: number;
  label: string;
  total_sales: number;
  transaction_count: number;
};

export type TopSellingProduct = {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  total_sales: number;
};

export type PaymentBreakdown = {
  method: PaymentMethod;
  amount: number;
  transaction_count: number;
};

export type SalesReportRow = SaleRecord & {
  item_count: number;
  payment_methods: string | null;
};

export type PromotionType = 'bundle' | 'time_discount' | 'percentage_discount' | 'fixed_discount';

export type PromotionStatus = 'active' | 'scheduled' | 'inactive';

export type PromotionListItem = {
  id: number;
  name: string;
  promo_type: PromotionType;
  status: PromotionStatus;
  product_id: number | null;
  product_name: string | null;
  category_id: number | null;
  category_name: string | null;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  rule_json: string | null;
  created_at: string;
};

export type PrepaidProvider = 'smart' | 'globe' | 'tnt' | 'sun';

export type PrepaidTransaction = {
  id: number;
  cashier_id: number;
  cashier_name?: string;
  shift_id: number | null;
  provider: PrepaidProvider;
  mobile_number: string;
  amount: number;
  service_fee: number;
  status: 'completed' | 'failed' | 'voided';
  reference_number: string | null;
  created_at: string;
};

export type PrepaidSummary = {
  total_amount: number;
  service_fees: number;
  transaction_count: number;
};

export type AppSetting = {
  key: string;
  value: string | null;
  updated_at: string;
};

export type AuditLogItem = {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  metadata_json: string | null;
  created_at: string;
};

export type DatabaseCount = {
  count: number;
};
